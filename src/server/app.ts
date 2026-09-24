import express from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { loadMetadataContext } from "../automation/resolve-metadata";
import { readJson, save } from "../automation/io";
import { JobRepository } from "./repository";
import { JobWorker, jobDirectory, sourceDirectory } from "./worker";
import { detectType, ingestLocal, validateUpload } from "./ingestion";
import { MAX_SOURCE_BYTES } from "./ingestion/remote";
import {
  ClientError,
  confinedFile,
  safeMessage,
  validateUrl,
} from "./security";
import type { Settings, SettingsView } from "./contracts";

const optionsSchema = z
  .object({
    theme: z.string().max(100),
    durationMode: z.enum(["auto", "fixed"]).default("auto"),
    durationSeconds: z.number().positive().optional(),
    scheduledAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.durationMode === "fixed" && !v.durationSeconds)
      c.addIssue({
        code: "custom",
        message: "Fixed duration requires seconds.",
      });
    if (v.durationMode === "auto" && v.durationSeconds)
      c.addIssue({
        code: "custom",
        message: "Auto duration does not accept seconds.",
      });
    if (v.scheduledAt && Date.parse(v.scheduledAt) <= Date.now())
      c.addIssue({ code: "custom", message: "Choose a future schedule time." });
  });
export function defaults(root: string): Settings {
  const { config, themes } = loadMetadataContext(root);
  return {
    theme: config.video.theme ?? themes.active ?? Object.keys(themes.themes)[0],
    durationMode: config.video.durationMode,
    durationSeconds: config.video.durationSeconds,
    concurrency: 1,
    autoStart: false,
  };
}
export function createApp(
  root: string,
  repo: JobRepository,
  worker: JobWorker,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return res.status(403).json({ error: "Local access only." });
    const origin = req.headers.origin;
    if (
      (origin && origin !== `http://${host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed." });
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  const getSettings = () => repo.settings(defaults(root));
  const settingsView = (): SettingsView => {
    const { config, themes } = loadMetadataContext(root);
    return {
      ...getSettings(),
      themes: Object.entries(themes.themes).map(([id, t]) => ({
        id,
        name: t.name,
      })),
      plannerConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
      voiceIdConfigured: Boolean(
        process.env.ELEVENLABS_VOICE_ID || config.tts.voiceId,
      ),
      plannerModel: config.planner.openrouterModel,
      voiceModel: config.tts.modelId,
      workerPaused: worker.paused,
      offline: worker.offline,
      storage: "Managed local SQLite + source snapshots",
      output: "Managed job output folders",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  };
  const options = (input: unknown) => {
    const parsed = optionsSchema.parse(input);
    if (!Object.hasOwn(loadMetadataContext(root).themes.themes, parsed.theme))
      throw new ClientError("Unknown theme.");
    return parsed;
  };
  app.get("/api/settings", (_req, res) => res.json(settingsView()));
  app.put("/api/settings", (req, res) => {
    const value = z
      .object({
        theme: z.string(),
        durationMode: z.enum(["auto", "fixed"]),
        durationSeconds: z.number().positive().optional(),
        concurrency: z.number().int().min(1).max(4),
        autoStart: z.boolean(),
      })
      .strict()
      .parse(req.body);
    options({
      theme: value.theme,
      durationMode: value.durationMode,
      durationSeconds: value.durationSeconds,
    });
    repo.setSettings(value);
    res.json(settingsView());
  });
  app.post("/api/worker", (req, res) => {
    const { paused } = z
      .object({ paused: z.boolean() })
      .strict()
      .parse(req.body);
    if (!paused && worker.offline)
      throw new ClientError(
        "This server is in offline verification mode.",
        409,
      );
    worker.paused = paused;
    res.json(settingsView());
  });
  app.get("/api/jobs", (_req, res) =>
    res.json({
      jobs: repo.list(),
      paused: worker.paused,
      active: [...worker.active],
    }),
  );
  app.post("/api/jobs/urls", (req, res) => {
    const input = z
      .object({
        urls: z.array(z.string().max(2048)).min(1).max(20),
        options: z.unknown(),
      })
      .strict()
      .parse(req.body);
    const opts = options(input.options);
    const jobs = repo.createBatch(
      input.urls.map((reference) => {
        const url = validateUrl(reference);
        const name = decodeURIComponent(
          url.pathname.split("/").pop() || url.hostname,
        );
        return {
          ...opts,
          sourceType: detectType(name),
          sourceLocationType: "REMOTE",
          sourceReference: url.href,
          sourceOriginalName: name,
          sourceMimeType: "",
          title: name,
        };
      }),
    );
    res.status(201).json({ jobs });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: {
      fileSize: MAX_SOURCE_BYTES,
      files: 20,
      fields: 1,
      fieldSize: 4096,
      parts: 21,
    },
  });
  // Bound aggregate memory to one upload batch at a time (20 x 20MB maximum).
  let uploading = false;
  app.post(
    "/api/jobs/uploads",
    (req, res, next) => {
      if (uploading)
        return res.status(429).json({
          error: "Another upload is being processed. Try again shortly.",
        });
      uploading = true;
      res.on("finish", () => {
        uploading = false;
      });
      res.on("close", () => {
        uploading = false;
      });
      next();
    },
    upload.array("files", 20),
    async (req, res) => {
      const files = req.files as Express.Multer.File[];
      if (!files?.length)
        throw new ClientError("Choose at least one supported file.");
      const opts = options(JSON.parse(req.body.options ?? "{}"));
      const ids = files.map(() => randomUUID());
      try {
        const inputs: Parameters<JobRepository["createBatch"]>[0] = [];
        for (const [i, file] of files.entries()) {
          validateUpload(file.originalname, file.buffer);
          const directory = sourceDirectory(root, ids[i]);
          await mkdir(directory, { recursive: true });
          const destination = path.join(
            directory,
            "original" + path.extname(file.originalname).toLowerCase(),
          );
          await writeFile(destination, file.buffer, { flag: "wx" });
          const normalized = await ingestLocal(
            destination,
            file.originalname,
            root,
            file.buffer,
          );
          await save(path.join(directory, "normalized.json"), normalized);
          inputs.push({
            ...opts,
            sourceType: normalized.sourceType,
            sourceLocationType: "LOCAL",
            sourceReference: file.originalname,
            sourceOriginalName: file.originalname,
            sourceMimeType: file.mimetype,
            title: normalized.title,
          });
        }
        res.status(201).json({ jobs: repo.createBatch(inputs, ids) });
      } catch (e) {
        for (const id of ids)
          await rm(sourceDirectory(root, id), { recursive: true, force: true });
        throw e;
      }
    },
  );
  app.get("/api/jobs/:id", async (req, res) => {
    const job = repo.get(req.params.id);
    const directory = jobDirectory(root, job.id);
    const optional = async (name: string, source = false) => {
      try {
        return await readJson(
          path.join(source ? sourceDirectory(root, job.id) : directory, name),
        );
      } catch {
        return null;
      }
    };
    let narration: string | null = null;
    try {
      narration = await readFile(path.join(directory, "voiceover.txt"), "utf8");
    } catch {
      /* not generated yet */
    }
    const audio = (await optional("audio-duration.json")) as {
      duration?: number;
    } | null;
    // Only allowlisted structured artifacts; engine metadata and raw provider logs stay private.
    res.json({
      job,
      events: repo.events(job.id),
      source: await optional("normalized.json", true),
      plan:
        (await optional("render-plan.json")) ??
        (await optional("video-plan.json")),
      narration,
      audioDuration: audio?.duration ?? null,
    });
  });
  app.post("/api/jobs/:id/action", (req, res) => {
    const value = z
      .object({
        action: z.enum(["retry", "cancel", "now", "reschedule"]),
        scheduledAt: z.string().optional(),
      })
      .strict()
      .parse(req.body);
    res.json(repo.action(req.params.id, value.action, value.scheduledAt));
  });
  app.get("/api/jobs/:id/artifacts/:kind", async (req, res) => {
    const job = repo.get(req.params.id);
    if (job.status !== "COMPLETED")
      throw new ClientError("Validated output is not available.", 404);
    const name =
      req.params.kind === "video"
        ? "final.mp4"
        : req.params.kind === "poster"
          ? "poster.png"
          : null;
    if (!name) throw new ClientError("Artifact not found.", 404);
    const directory = jobDirectory(root, job.id);
    const validation = (await readJson(
      path.join(directory, "validation.json"),
    )) as { valid: boolean };
    if (!validation.valid)
      throw new ClientError("Output validation is unavailable.", 404);
    const file = await confinedFile(
      path.join(root, "output", "jobs"),
      path.join(directory, "renders", name),
    );
    if (req.query.download === "1")
      res.download(
        file,
        `tinitiate-${job.id}.${name.endsWith("mp4") ? "mp4" : "png"}`,
        { dotfiles: "allow" },
      );
    else res.sendFile(file, { dotfiles: "allow" });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(
    express.static(path.join(root, "dist", "web"), {
      index: false,
      dotfiles: "allow",
    }),
  );
  app.get(/.*/, (_req, res) =>
    res.sendFile(path.join(root, "dist", "web", "index.html"), {
      dotfiles: "allow",
    }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next; // Express identifies error handlers by all four parameters.
      const status =
        error instanceof ClientError
          ? error.status
          : error instanceof z.ZodError ||
              error instanceof SyntaxError ||
              error instanceof multer.MulterError
            ? 400
            : 500;
      res.status(status).json({
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join(" ")
            : safeMessage(error),
      });
    },
  );
  return app;
}

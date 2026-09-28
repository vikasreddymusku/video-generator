import express from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { humanizeFilename, loadMetadataContext } from "../automation/resolve-metadata";
import { readJson, save } from "../automation/io";
import {
  brandingConfigSchema,
  brandingOverrideSchema,
  configSchema,
} from "../automation/types";
import { prepareBrandingAssets, resolveBranding } from "../automation/branding";
import { probe } from "../automation/media";
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
    brandingOverride: brandingOverrideSchema.optional(),
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
  const configFile = path.join(root, "automation.config.json");
  const brandingConfig = async () =>
    configSchema.parse(await readJson(configFile));
  const brandingView = async () => {
    const config = await brandingConfig();
    return {
      brand:
        config.brand ??
        {
          name: "",
          tagline: "",
          cta: "",
          website: "",
          email: "",
          phone: "",
          address: "",
        },
      branding: config.branding,
    };
  };
  const saveBranding = async (value: unknown) => {
    const input = z.object({
      brand: z.object({ name: z.string().trim().min(1).max(120), tagline: z.string().trim().min(1).max(240), cta: z.string().trim().min(1).max(120), website: z.string().trim().min(1).max(300), email: z.email(), phone: z.string().trim().min(1).max(80), address: z.string().trim().min(1).max(500) }).strict(),
      branding: brandingConfigSchema,
    }).strict().parse(value);
    const current = await brandingConfig();
    await save(configFile, configSchema.parse({ ...current, ...input }));
    return brandingView();
  };
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
  const withBranding = (opts: ReturnType<typeof options>, title: string) => {
    const config = loadMetadataContext(root).config;
    return {
      ...opts,
      brandingOverride: opts.brandingOverride,
      branding: resolveBranding(config, title, config.render.fps, opts.brandingOverride),
    };
  };
  app.get("/api/branding", async (_req, res) => res.json(await brandingView()));
  app.put("/api/branding", async (req, res) => res.json(await saveBranding(req.body)));
  app.post("/api/branding/preview", async (req, res) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(160).default("AWS DATA ENGINEERING"),
        brand: z
          .object({
            name: z.string().trim().min(1).max(120),
            tagline: z.string().trim().min(1).max(240),
            cta: z.string().trim().min(1).max(120),
            website: z.string().trim().min(1).max(300),
            email: z.email(),
            phone: z.string().trim().min(1).max(80),
            address: z.string().trim().min(1).max(500),
          })
          .strict()
          .optional(),
        branding: brandingConfigSchema.optional(),
      })
      .strict()
      .parse(req.body ?? {});
    const current = await brandingConfig();
    const config = configSchema.parse({
      ...current,
      ...(input.brand ? { brand: input.brand } : {}),
      ...(input.branding ? { branding: input.branding } : {}),
    });
    res.json({
      branding: await prepareBrandingAssets(
        root,
        resolveBranding(config, input.title, config.render.fps),
      ),
    });
  });
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
          ...withBranding(opts, name),
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
            ...withBranding(opts, normalized.title),
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
  const hybridUpload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 3,
      fields: 3,
      fieldSize: 512 * 1024,
      parts: 7,
    },
  });
  let hybridUploading = false;
  app.post(
    "/api/jobs/hybrid",
    (req, res, next) => {
      if (hybridUploading)
        return res.status(429).json({
          error: "Another hybrid upload is being processed. Try again shortly.",
        });
      hybridUploading = true;
      res.on("finish", () => { hybridUploading = false; });
      res.on("close", () => { hybridUploading = false; });
      next();
    },
    hybridUpload.fields([
      { name: "source", maxCount: 1 },
      { name: "video", maxCount: 1 },
      { name: "audio", maxCount: 1 },
    ]),
    async (req, res) => {
      const input = z
        .object({
          options: z.unknown(),
          visualSource: z.enum(["AI", "USER_VIDEO"]),
          narrationSource: z.enum(["AI_SCRIPT", "USER_SCRIPT", "USER_AUDIO"]),
          script: z.string().max(512 * 1024).optional(),
          sourceUrl: z.string().max(2048).optional(),
        })
        .strict()
        .parse(req.body);
      const baseOptions = options(input.options);
      const files = req.files as Record<string, Express.Multer.File[]>;
      const sourceFile = files?.source?.[0];
      const videoFile = files?.video?.[0];
      const audioFile = files?.audio?.[0];
      if (input.visualSource === "USER_VIDEO" && !videoFile)
        throw new ClientError("Choose a user video.");
      if (input.visualSource === "AI" && !sourceFile && !input.sourceUrl)
        throw new ClientError("Choose a source document or source URL.");
      if (sourceFile && input.sourceUrl)
        throw new ClientError("Choose either a source document or source URL, not both.");
      if (input.narrationSource === "USER_SCRIPT" && !input.script?.trim())
        throw new ClientError("Narration script cannot be empty.");
      if (input.narrationSource === "USER_AUDIO" && !audioFile)
        throw new ClientError("Choose a narration audio file.");
      if (input.narrationSource !== "USER_AUDIO" && audioFile)
        throw new ClientError("Narration audio is only valid when narration source is USER_AUDIO.");
      const id = randomUUID();
      const directory = sourceDirectory(root, id);
      try {
        await mkdir(directory, { recursive: true });
        let normalized: import("./contracts").NormalizedSource | undefined;
        let sourceReference = "";
        let sourceOriginalName = "";
        let sourceMimeType = "";
        let title = "";
        if (sourceFile) {
          validateUpload(sourceFile.originalname, sourceFile.buffer);
          const destination = path.join(directory, "source" + path.extname(sourceFile.originalname).toLowerCase());
          await writeFile(destination, sourceFile.buffer, { flag: "wx" });
          normalized = await ingestLocal(destination, sourceFile.originalname, root, sourceFile.buffer);
          sourceReference = sourceFile.originalname;
          sourceOriginalName = sourceFile.originalname;
          sourceMimeType = sourceFile.mimetype;
          title = normalized.title;
        } else if (input.sourceUrl) {
          const url = validateUrl(input.sourceUrl);
          sourceReference = url.href;
          sourceOriginalName = decodeURIComponent(url.pathname.split("/").pop() || url.hostname);
          title = humanizeFilename(sourceOriginalName);
        }
        if (videoFile) {
          const ext = path.extname(videoFile.originalname).toLowerCase();
          if (![".mp4", ".webm", ".mov"].includes(ext))
            throw new ClientError("Supported user videos: .mp4, .webm and .mov.");
          if (!videoFile.size || !(await probe(videoFile.path ?? "").catch(() => null))) {
            /* memory uploads do not have a path; readability is checked below. */
          }
          const pending = path.join(directory, "video" + ext);
          await writeFile(pending, videoFile.buffer, { flag: "wx" });
          const videoProbe = await probe(pending);
          if (!videoProbe.streams.some((stream) => stream.codec_type === "video"))
            throw new ClientError("The uploaded video could not be read.");
          if (!title) title = humanizeFilename(videoFile.originalname);
          if (!sourceOriginalName) sourceOriginalName = videoFile.originalname;
          if (!sourceReference) sourceReference = videoFile.originalname;
          if (!sourceMimeType) sourceMimeType = videoFile.mimetype;
        }
        if (audioFile) {
          const ext = path.extname(audioFile.originalname).toLowerCase();
          if (![".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(ext))
            throw new ClientError("Supported narration audio: .mp3, .wav, .m4a, .aac, .ogg and .webm.");
          const pending = path.join(directory, "narration" + ext);
          await writeFile(pending, audioFile.buffer, { flag: "wx" });
          const audioProbe = await probe(pending);
          if (!audioProbe.streams.some((stream) => stream.codec_type === "audio"))
            throw new ClientError("The uploaded narration audio could not be read.");
        }
        if (!normalized) {
          const reference = sourceReference || videoFile!.originalname;
          normalized = {
            sourceType: "VIDEO",
            sourceReference: reference,
            originalName: sourceOriginalName || reference,
            title,
            content: "# " + title,
            sections: [{ heading: title, text: "# " + title }],
            provenance: {
              reference,
              extractedAt: new Date().toISOString(),
              assets: [],
              warnings: [],
            },
          };
        }
        await save(path.join(directory, "normalized.json"), normalized);
        const videoName = videoFile ? "video" + path.extname(videoFile.originalname).toLowerCase() : undefined;
        const audioName = audioFile ? "narration" + path.extname(audioFile.originalname).toLowerCase() : undefined;
        const job = {
          ...withBranding(baseOptions, title),
          sourceType: normalized.sourceType,
          sourceLocationType: input.sourceUrl ? "REMOTE" : "LOCAL",
          sourceReference,
          sourceOriginalName,
          sourceMimeType,
          title,
          visualSource: input.visualSource,
          narrationSource: input.narrationSource,
          visualAssetName: videoName,
          narrationAssetName: audioName,
          narrationScript: input.narrationSource === "USER_SCRIPT" ? input.script : undefined,
        };
        res.status(201).json({ jobs: repo.createBatch([job], [id]) });
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
  );
  const brandingUpload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  const brandingSlot = (value: string | string[]) => z.enum(["logo", "intro", "outro"]).parse(Array.isArray(value) ? "" : value);
  const brandingAsset = async (slot: "logo" | "intro" | "outro") => {
    const config = await brandingConfig();
    return slot === "logo" ? config.branding.logoAsset : config.branding[slot].asset;
  };
  app.post("/api/branding/assets/:slot", brandingUpload.single("file"), async (req, res) => {
    const slot = brandingSlot(req.params.slot);
    const file = req.file;
    if (!file) throw new ClientError("Choose a branding asset.");
    const ext = path.extname(file.originalname).toLowerCase();
    const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    const videoExtensions = new Set([".mp4", ".webm"]);
    if ((slot === "logo" && !imageExtensions.has(ext)) || (slot !== "logo" && !videoExtensions.has(ext)))
      throw new ClientError(slot === "logo" ? "Logo assets must be PNG, JPG, or WebP images." : "Intro and outro assets must be MP4 or WebM videos.");
    if (!file.size) throw new ClientError("Branding assets cannot be empty.");
    const id = randomUUID();
    const relative = `branding/${id}${ext}`;
    const publicFile = path.join(root, "public", relative);
    const pending = publicFile + ".pending";
    await mkdir(path.dirname(publicFile), { recursive: true });
    try {
      await writeFile(pending, file.buffer, { flag: "wx" });
      if (slot === "logo") {
        const signature = file.buffer.subarray(0, 12);
        const valid = (ext === ".png" && signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (ext === ".webp" && signature.subarray(0, 4).toString() === "RIFF" && signature.subarray(8, 12).toString() === "WEBP") || ([".jpg", ".jpeg"].includes(ext) && signature.subarray(0, 3).equals(Buffer.from([255,216,255])));
        if (!valid) throw new ClientError("The uploaded file does not match the selected image format.");
      } else if (!(await probe(pending)).streams.some(stream => stream.codec_type === "video")) {
        throw new ClientError("The uploaded branding asset contains no video stream.");
      }
      await rename(pending, publicFile);
      const config = await brandingConfig();
      const branding = slot === "logo" ? { ...config.branding, logoAsset: relative } : { ...config.branding, [slot]: { ...config.branding[slot], asset: relative, mode: "uploaded", enabled: true } };
      await save(configFile, configSchema.parse({ ...config, branding }));
      res.status(201).json({ asset: relative, branding: await brandingView() });
    } catch (error) {
      await rm(pending, { force: true });
      await rm(publicFile, { force: true });
      throw error;
    }
  });
  app.delete("/api/branding/assets/:slot", async (req, res) => {
    const slot = brandingSlot(req.params.slot);
    const config = await brandingConfig();
    const asset = slot === "logo" ? config.branding.logoAsset : config.branding[slot].asset;
    if (asset) await rm(path.join(root, "public", asset), { force: true });
    const branding = slot === "logo" ? { ...config.branding, logoAsset: undefined } : { ...config.branding, [slot]: { ...config.branding[slot], asset: undefined, mode: "dynamic" } };
    await save(configFile, configSchema.parse({ ...config, branding }));
    res.json(await brandingView());
  });
  app.get("/api/branding/assets/:slot", async (req, res) => {
    const asset = await brandingAsset(brandingSlot(req.params.slot));
    if (!asset) throw new ClientError("Branding asset not found.", 404);
    const file = await confinedFile(path.join(root, "public", "branding"), path.join(root, "public", asset));
    res.sendFile(file, { dotfiles: "deny" });
  });
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

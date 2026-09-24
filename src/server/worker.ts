import path from "node:path";
import { readFile } from "node:fs/promises";
import { runAutomation } from "../automation/main";
import { hash, readJson, save } from "../automation/io";
import { videoPlanSchema } from "../automation/types";
import type { Job, NormalizedSource } from "./contracts";
import { JobRepository } from "./repository";
import { ingestRemote } from "./ingestion";
import { safeMessage } from "./security";

export const jobDirectory = (root: string, id: string) =>
  path.join(root, "output", "jobs", `job-${id}`);
export const sourceDirectory = (root: string, id: string) =>
  path.join(root, "inputs", "job-uploads", id);
export type Engine = (
  job: Job,
  source: NormalizedSource,
  stage: (stage: string) => void,
) => Promise<{ valid: boolean; title: string; duration: number }>;
export function engineAdapter(
  root: string,
  dependencies: Parameters<typeof runAutomation>[2] = {},
): Engine {
  // The existing renderer shares an engine lock and generated assets. Serialize only
  // this section; independently bounded ingestion can use configured worker slots.
  let tail: Promise<unknown> = Promise.resolve();
  return (job, source, stage) => {
    const run = tail.then(async () => {
      const document = {
        type:
          job.sourceLocationType === "REMOTE"
            ? ("remote" as const)
            : ("local" as const),
        originalReference: job.sourceReference,
        resolvedReference: job.sourceReference,
        content:
          source.sourceType === "MARKDOWN"
            ? source.content
            : `# ${source.title}\n\n${source.content}`,
        sourceHash: hash(source.content),
        sourceName: source.originalName,
        fetchedAt: source.provenance.extractedAt,
      };
      await runAutomation(
        [
          "--source",
          job.sourceReference,
          "--theme",
          job.theme,
          "--output-dir",
          "output/jobs",
        ],
        root,
        {
          ...dependencies,
          sourceDocument: document,
          jobOptions: {
            slug: `job-${job.id}`,
            durationMode: job.durationMode,
            durationSeconds: job.durationSeconds,
          },
          onStage: stage,
          onAudio: (duration) =>
            save(path.join(jobDirectory(root, job.id), "audio-duration.json"), {
              duration,
            }),
        },
      );
      const directory = jobDirectory(root, job.id);
      const validation = (await readJson(
        path.join(directory, "validation.json"),
      )) as { valid: boolean };
      const receipt = (await readJson(
        path.join(directory, "renders", "render-receipt.json"),
      )) as { succeeded: boolean; outputHash: string };
      if (
        !validation.valid ||
        !receipt.succeeded ||
        receipt.outputHash !==
          hash(await readFile(path.join(directory, "renders", "final.mp4")))
      )
        throw new Error("Output did not pass receipt verification.");
      const plan = videoPlanSchema.parse(
        await readJson(path.join(directory, "render-plan.json")),
      );
      return { valid: true, title: plan.title, duration: plan.durationSeconds };
    });
    tail = run.catch(() => {});
    return run;
  };
}
export class JobWorker {
  paused = true;
  active = new Set<string>();
  private timer?: NodeJS.Timeout;
  constructor(
    readonly root: string,
    readonly repo: JobRepository,
    readonly engine: Engine,
    readonly concurrency: () => number,
    readonly offline = false,
  ) {}
  start() {
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref();
  }
  stop() {
    this.paused = true;
    clearInterval(this.timer);
  }
  tick() {
    if (this.paused || this.offline) return;
    while (this.active.size < this.concurrency()) {
      const job = this.repo.claim();
      if (!job) return;
      this.active.add(job.id);
      void this.process(job).finally(() => this.active.delete(job.id));
    }
  }
  async process(job: Job) {
    try {
      const sourceFile = path.join(
        sourceDirectory(this.root, job.id),
        "normalized.json",
      );
      let source: NormalizedSource;
      try {
        source = (await readJson(sourceFile)) as NormalizedSource;
      } catch {
        if (job.sourceLocationType !== "REMOTE")
          throw new Error(
            "Managed source snapshot is missing. Upload the source again.",
          );
        source = await ingestRemote(job.sourceReference);
        await save(sourceFile, source);
      }
      job.sourceType = source.sourceType;
      job.title = source.title;
      this.repo.save(job);
      const result = await this.engine(job, source, (stage) =>
        this.repo.stage(job.id, stage),
      );
      this.repo.complete(job.id, result);
    } catch (e) {
      this.repo.fail(job.id, safeMessage(e));
    }
  }
}

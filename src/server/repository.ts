import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ClientError } from "./security";
import {
  stages,
  type Job,
  type JobEvent,
  type Settings,
  type Status,
} from "./contracts";

export class JobRepository {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL, scheduled_at TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,scheduled_at,created_at);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), stage TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, attempt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS server_lock(id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL);
      PRAGMA user_version=1;`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  acquireServer() {
    this.transaction(() => {
      const row = this.db
        .prepare("SELECT pid FROM server_lock WHERE id=1")
        .get();
      if (row) {
        let alive = true;
        try {
          process.kill(Number(row.pid), 0);
        } catch (e) {
          alive = (e as NodeJS.ErrnoException).code !== "ESRCH";
        }
        if (alive) throw new Error("Another UI server owns this job store.");
      }
      this.db
        .prepare("INSERT OR REPLACE INTO server_lock VALUES(1,?)")
        .run(process.pid);
    });
  }
  releaseServer() {
    this.db.prepare("DELETE FROM server_lock WHERE pid=?").run(process.pid);
  }
  list(): Job[] {
    return this.db
      .prepare("SELECT data FROM jobs ORDER BY created_at DESC, rowid DESC")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  get(id: string): Job {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new ClientError("Job not found.", 404);
    const row = this.db.prepare("SELECT data FROM jobs WHERE id=?").get(id);
    if (!row) throw new ClientError("Job not found.", 404);
    return JSON.parse(String(row.data));
  }
  save(job: Job) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO jobs(id,status,scheduled_at,created_at,data) VALUES(?,?,?,?,?)",
      )
      .run(
        job.id,
        job.status,
        job.scheduledAt,
        job.createdAt,
        JSON.stringify(job),
      );
    return job;
  }
  createBatch(
    inputs: Omit<
      Job,
      | "id"
      | "status"
      | "createdAt"
      | "startedAt"
      | "completedAt"
      | "errorStage"
      | "errorMessage"
      | "attempt"
    >[],
    ids?: string[],
  ) {
    return this.transaction(() =>
      inputs.map((input, i) => {
        const job: Job = {
          ...input,
          id: ids?.[i] ?? randomUUID(),
          status: input.scheduledAt ? "SCHEDULED" : "QUEUED",
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
          errorStage: null,
          errorMessage: null,
          attempt: 0,
        };
        this.save(job);
        this.event(
          job,
          "SOURCE_ACCEPTED",
          "COMPLETED",
          "Source accepted; awaiting generation.",
        );
        return job;
      }),
    );
  }
  event(job: Job, stage: string, status: string, message: string) {
    this.db
      .prepare(
        "INSERT INTO events(job_id,stage,status,message,created_at,attempt) VALUES(?,?,?,?,?,?)",
      )
      .run(
        job.id,
        stage,
        status,
        message,
        new Date().toISOString(),
        job.attempt,
      );
  }
  events(id: string): JobEvent[] {
    return this.db
      .prepare(
        "SELECT id,job_id AS jobId,stage,status,message,created_at AS createdAt,attempt FROM events WHERE job_id=? ORDER BY id",
      )
      .all(id) as unknown as JobEvent[];
  }
  claim(now = new Date().toISOString()): Job | undefined {
    return this.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT id FROM jobs WHERE status='QUEUED' OR (status='SCHEDULED' AND scheduled_at<=?) ORDER BY COALESCE(scheduled_at,created_at),rowid LIMIT 1",
        )
        .get(now);
      if (!row) return;
      const job = this.get(String(row.id));
      job.status = "PLANNING";
      job.startedAt = now;
      job.attempt++;
      job.errorStage = null;
      job.errorMessage = null;
      this.save(job);
      this.event(job, "EXTRACTING", "STARTED", "Extracting source content.");
      return job;
    });
  }
  stage(id: string, stage: string) {
    const job = this.get(id);
    if (!stages.includes(job.status as (typeof stages)[number]))
      throw new Error("Job is not running.");
    if (stage === "COMPLETED") return; // Completion requires an independently checked validation receipt.
    const previous = this.events(id)
      .filter((e) => e.attempt === job.attempt && e.status === "STARTED")
      .at(-1);
    if (previous)
      this.event(
        job,
        previous.stage,
        "COMPLETED",
        `${previous.stage.toLowerCase().replaceAll("_", " ")} finished.`,
      );
    if (stage !== "NARRATION_PREPARED") job.status = stage as Status;
    this.save(job);
    this.event(
      job,
      stage,
      "STARTED",
      `${stage.toLowerCase().replaceAll("_", " ")} started.`,
    );
  }
  fail(id: string, message: string) {
    const job = this.get(id);
    const stage =
      this.events(id)
        .filter((e) => e.attempt === job.attempt && e.status === "STARTED")
        .at(-1)?.stage ?? job.status;
    job.errorStage = stage;
    job.status = "FAILED";
    job.errorMessage = message;
    this.save(job);
    this.event(job, stage, "FAILED", message);
  }
  complete(
    id: string,
    result: { valid: boolean; title: string; duration: number },
  ) {
    const job = this.get(id);
    if (!result.valid || job.status !== "VALIDATING")
      throw new Error("Successful validation is required for completion.");
    job.status = "COMPLETED";
    job.completedAt = new Date().toISOString();
    job.title = result.title;
    job.actualDuration = result.duration;
    this.save(job);
    this.event(job, "VALIDATING", "COMPLETED", "Output validation passed.");
    this.event(job, "COMPLETED", "COMPLETED", "Validated MP4 ready.");
  }
  action(
    id: string,
    action: "retry" | "cancel" | "now" | "reschedule",
    scheduledAt?: string,
  ) {
    return this.transaction(() => {
      const job = this.get(id);
      const allowed =
        action === "retry" ? ["FAILED", "CANCELED"] : ["QUEUED", "SCHEDULED"];
      if (!allowed.includes(job.status))
        throw new ClientError(
          "This action is unavailable for the current job state.",
          409,
        );
      if (
        action === "reschedule" &&
        (!scheduledAt ||
          !Number.isFinite(Date.parse(scheduledAt)) ||
          Date.parse(scheduledAt) <= Date.now())
      )
        throw new ClientError("Choose a future schedule time.");
      job.status =
        action === "cancel"
          ? "CANCELED"
          : action === "reschedule"
            ? "SCHEDULED"
            : "QUEUED";
      job.scheduledAt =
        action === "reschedule" ? new Date(scheduledAt!).toISOString() : null;
      job.errorMessage = null;
      job.errorStage = null;
      this.save(job);
      this.event(job, job.status, "COMPLETED", `Job ${action}.`);
      return job;
    });
  }
  recover() {
    for (const job of this.list())
      if (stages.includes(job.status as (typeof stages)[number]))
        this.fail(
          job.id,
          "The server stopped during generation. Retry to reuse saved artifacts. If the engine reports a lock, verify the earlier process has stopped before removing it.",
        );
  }
  settings(defaults: Settings): Settings {
    const row = this.db.prepare("SELECT data FROM settings WHERE id=1").get();
    return row ? JSON.parse(String(row.data)) : defaults;
  }
  setSettings(settings: Settings) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(1,?)")
      .run(JSON.stringify(settings));
  }
  close() {
    this.db.close();
  }
}

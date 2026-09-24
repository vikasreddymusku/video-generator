import dotenv from "dotenv";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { JobRepository } from "./repository";
import { engineAdapter, JobWorker } from "./worker";
import { createApp, defaults } from "./app";
async function main() {
  const root = process.cwd();
  dotenv.config({ path: path.join(root, ".env"), quiet: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  const repo = new JobRepository(path.join(root, "data", "jobs.sqlite"));
  repo.acquireServer();
  repo.recover();
  const offline = process.argv.includes("--offline");
  const worker = new JobWorker(
    root,
    repo,
    engineAdapter(root),
    () => repo.settings(defaults(root)).concurrency,
    offline,
  );
  worker.paused = offline || !repo.settings(defaults(root)).autoStart;
  const port = Number(process.env.UI_PORT ?? 3100);
  const server = createApp(root, repo, worker).listen(port, "127.0.0.1", () => {
    worker.start();
    console.log(
      `Tinitiate Video: http://localhost:${port} (${worker.paused ? "worker paused" : "worker running"})`,
    );
  });
  const shutdown = () => {
    worker.stop();
    server.close(() => {
      const timer = setInterval(() => {
        if (!worker.active.size) {
          clearInterval(timer);
          repo.releaseServer();
          repo.close();
          process.exit(0);
        }
      }, 250);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("error", (error) => {
    repo.releaseServer();
    repo.close();
    console.error(error.message);
    process.exitCode = 1;
  });
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Server startup failed.",
  );
  process.exitCode = 1;
});

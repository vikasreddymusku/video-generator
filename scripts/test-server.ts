import path from "node:path";
import { mkdir, mkdtemp, copyFile, cp, rm } from "node:fs/promises";
import { JobRepository } from "../src/server/repository";
import { JobWorker } from "../src/server/worker";
import { createApp } from "../src/server/app";
async function main() {
  const base = path.join(process.cwd(), ".verification");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "browser-"));
  for (const name of ["automation.config.json", "themes.json"])
    await copyFile(name, path.join(root, name));
  await cp(
    path.join(process.cwd(), "dist", "web"),
    path.join(root, "dist", "web"),
    { recursive: true },
  );
  const repo = new JobRepository(path.join(root, "jobs.sqlite"));
  const worker = new JobWorker(
    root,
    repo,
    async () => {
      throw new Error("Browser tests cannot invoke the video engine.");
    },
    () => 1,
    true,
  );
  const server = createApp(root, repo, worker).listen(3199, "127.0.0.1");
  const shutdown = () =>
    server.close(() => {
      repo.close();
      void rm(root, { recursive: true, force: true }).then(() =>
        process.exit(0),
      );
    });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
void main();

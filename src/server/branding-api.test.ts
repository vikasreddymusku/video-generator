import assert from "node:assert/strict";
import { once } from "node:events";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createApp } from "./app";
import { JobRepository } from "./repository";
import { JobWorker } from "./worker";

test("branding APIs resolve previews locally and only expose controlled assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-branding-api-"));
  await copyFile("automation.config.json", path.join(root, "automation.config.json"));
  await copyFile("themes.json", path.join(root, "themes.json"));
  const repo = new JobRepository(path.join(root, "jobs.sqlite"));
  let engineCalls = 0;
  const worker = new JobWorker(
    root,
    repo,
    async () => {
      engineCalls++;
      throw new Error("Branding preview must not run the video engine.");
    },
    () => 1,
    true,
  );
  const server = createApp(root, repo, worker).listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const initial = await fetch(`${base}/api/branding`);
    assert.equal(initial.status, 200);
    const branding = (await initial.json()) as {
      brand: { name: string };
      branding: { intro: { durationSeconds: number } };
    };
    assert.equal(branding.brand.name, "Tinitiate AI Solutions");
    assert.equal(branding.branding.intro.durationSeconds, 4);

    const preview = await fetch(`${base}/api/branding/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "AWS Data Engineering" }),
    });
    assert.equal(preview.status, 200, await preview.clone().text());
    const result = (await preview.json()) as {
      branding: { videoTitle: string; intro: { frames: number }; outro: { qrEnabled: boolean } };
    };
    assert.equal(result.branding.videoTitle, "AWS Data Engineering");
    assert.equal(result.branding.intro.frames, 120);
    assert.equal(result.branding.outro.qrEnabled, false);
    assert.equal(engineCalls, 0);

    const png = new Blob(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      { type: "image/png" },
    );
    const form = new FormData();
    form.append("file", png, "logo.png");
    const uploaded = await fetch(`${base}/api/branding/assets/logo`, {
      method: "POST",
      body: form,
    });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const asset = (await uploaded.json()) as { asset: string };
    assert.match(asset.asset, /^branding\/[a-f0-9-]+\.png$/);

    const served = await fetch(`${base}/api/branding/assets/logo`);
    assert.equal(served.status, 200);
    assert.deepEqual(
      new Uint8Array(await served.arrayBuffer()),
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    assert.equal(
      (await fetch(`${base}/api/branding/assets/not-a-slot`)).status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/branding/assets/logo`, { method: "DELETE" })).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/api/branding/assets/logo`)).status,
      404,
    );
    assert.equal(engineCalls, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();
    await rm(root, { recursive: true, force: true });
  }
});
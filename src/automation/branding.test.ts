import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readJson } from "./io";
import {
  applyBrandingTiming,
  prepareBrandingAssets,
  resolveBranding,
  stripBrandingTiming,
} from "./branding";
import { configSchema, videoPlanSchema } from "./types";

const loadConfig = async () =>
  configSchema.parse(await readJson("automation.config.json"));
const loadPlan = async () =>
  videoPlanSchema.parse(await readJson("output/ml-engineering/video-plan.json"));

test("default global branding resolves dynamic variables and FPS-based timing", async () => {
  const config = await loadConfig();
  const branding = resolveBranding(config, "AWS DATA ENGINEERING", 24);

  assert.equal(branding.intro.mode, "dynamic");
  assert.equal(branding.intro.durationSeconds, 4);
  assert.equal(branding.intro.frames, 96);
  assert.equal(branding.brandName, config.brand?.name);
  assert.equal(branding.tagline, config.brand?.tagline);
  assert.equal(branding.videoTitle, "AWS DATA ENGINEERING");
  assert.equal(branding.outro.frames, 120);
  assert.equal(branding.outro.qrEnabled, false);
  assert.equal(branding.outro.qrDestination, undefined);
});

test("branding adds only configured intro/outro duration to a dynamic plan", async () => {
  const config = await loadConfig();
  const plan = await loadPlan();
  const branding = resolveBranding(config, "Python for Data Engineering", plan.fps);
  const branded = applyBrandingTiming(plan, branding);

  assert.equal(branded.totalFrames, plan.totalFrames + 4 * plan.fps + 5 * plan.fps);
  assert.equal(branded.durationSeconds, plan.durationSeconds + 9);
  assert.equal(branded.scenes[0].id, "global-brand-intro");
  assert.equal(branded.scenes.at(-1)?.id, "global-brand-outro");
  assert.equal(branded.scenes[1].startFrame, plan.scenes[0].startFrame + 4 * plan.fps);
  assert.equal(videoPlanSchema.parse(branded).totalFrames, branded.totalFrames);
  assert.deepEqual(stripBrandingTiming(branded, branding), plan);

  // Phase 1-5 plans without global synthetic scenes remain valid and unchanged.
  assert.equal(stripBrandingTiming(plan, branding), plan);
  assert.equal(videoPlanSchema.parse(plan).title, plan.title);
});

test("uploaded and none modes resolve without mutating global branding", async () => {
  const config = await loadConfig();
  const before = structuredClone(config.branding);
  const uploaded = resolveBranding(config, "SQL Server Tutorial", 30, {
    intro: { mode: "uploaded", asset: "branding/intro-asset.mp4" },
    outro: { mode: "uploaded", asset: "branding/outro-asset.webm" },
  });
  assert.equal(uploaded.intro.mode, "uploaded");
  assert.equal(uploaded.intro.asset, "branding/intro-asset.mp4");
  assert.equal(uploaded.outro.mode, "uploaded");
  assert.equal(uploaded.outro.asset, "branding/outro-asset.webm");
  assert.deepEqual(config.branding, before);

  const none = resolveBranding(config, "SQL Server Tutorial", 30, {
    intro: { mode: "none" },
    outro: { mode: "none" },
  });
  assert.equal(none.intro.frames, 0);
  assert.equal(none.outro.frames, 0);
  const plan = await loadPlan();
  assert.equal(applyBrandingTiming(plan, none), plan);
});

test("QR assets are generated only for an explicit HTTPS destination", async () => {
  const config = await loadConfig();
  const root = await mkdtemp(path.join(os.tmpdir(), "video-branding-"));
  try {
    const noDestination = resolveBranding(config, "AWS Data Engineering", 30);
    assert.equal(noDestination.outro.qrEnabled, false);
    assert.equal((await prepareBrandingAssets(root, noDestination)).outro.qrAsset, undefined);

    const withDestination = resolveBranding(
      {
        ...config,
        branding: {
          ...config.branding,
          outro: {
            ...config.branding.outro,
            showQrCode: true,
            qrDestination: "https://example.com/enroll",
          },
        },
      },
      "AWS Data Engineering",
      30,
    );
    const prepared = await prepareBrandingAssets(root, withDestination);
    assert.equal(prepared.outro.qrEnabled, true);
    assert.match(prepared.outro.qrAsset!, /^branding\/qr-[a-f0-9]{24}\.svg$/);
    assert.match(
      await readFile(path.join(root, "public", prepared.outro.qrAsset!), "utf8"),
      /<svg/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

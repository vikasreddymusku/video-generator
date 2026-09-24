import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseQueue, markDone } from "./queue";
import { loadContent } from "./load-content";
import { readJson } from "./io";
import { videoPlanSchema, configSchema, themeSchema } from "./types";
import { CodexTestPlanner } from "./planner";
import { alignScenes, generateVoiceover } from "./tts-elevenlabs";
import { validateVideo } from "./validate";
import { OpenRouterPlanner } from "./planner-openrouter";

test("queue keeps order, skips headings, and requires validation before completion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "video-queue-"));
  const file = path.join(directory, "queue.md");
  try {
    const raw =
      "# Videos\r\n\r\n* ./inputs/a.md\r\n* ./inputs/b.md <!-- done -->\r\n";
    await writeFile(file, raw);
    const items = parseQueue(raw);
    assert.deepEqual(
      items.map((i) => i.done),
      [false, true],
    );
    await assert.rejects(
      markDone(file, items[0], {
        valid: false,
        checks: { video: false },
        errors: ["failed"],
      }),
    );
    assert.equal(await readFile(file, "utf8"), raw);
    await markDone(file, items[0], {
      valid: true,
      checks: { video: true },
      errors: [],
    });
    assert.match(await readFile(file, "utf8"), /a.md <!-- done -->\r\n/);
    await assert.rejects(
      markDone(file, items[0], {
        valid: true,
        checks: { video: true },
        errors: [],
      }),
      /Queue changed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("real input and plan validate, preserve narration, and reject stale content and timing", async () => {
  const content = await loadContent("inputs/ml-engineering.md");
  const plan = videoPlanSchema.parse(
    await readJson("output/ml-engineering/video-plan.json"),
  );
  assert.ok(content.audience.includes("Python"));
  assert.ok(content.courseContent.includes("Feature Engineering"));
  assert.equal(content.suppliedVoiceover, plan.voiceover.text);
  assert.equal(plan.totalFrames, 900);
  assert.equal(plan.scenes.length, 7);
  assert.throws(() =>
    videoPlanSchema.parse({
      ...plan,
      scenes: plan.scenes.map((s, i) => ({
        ...s,
        startFrame: i === 1 ? 999 : s.startFrame,
      })),
    }),
  );
  const config = configSchema.parse(await readJson("automation.config.json"));
  const catalog = (await readJson("themes.json")) as {
    themes: Record<string, unknown>;
  };
  const theme = themeSchema.parse(catalog.themes[plan.theme]);
  const input = {
    content,
    config,
    theme,
    themeId: plan.theme,
    planFile: "output/ml-engineering/video-plan.json",
  };
  await new CodexTestPlanner().createVideoPlan(input);
  await assert.rejects(
    new CodexTestPlanner().createVideoPlan({
      ...input,
      content: { ...content, sourceHash: "changed" },
    }),
    /Source changed/,
  );
  await assert.rejects(
    new OpenRouterPlanner({ apiKey: () => undefined }).createVideoPlan(input),
    /OpenRouter/,
  );
});
test("narration is never accelerated, alignment preserves the exact composition length", async () => {
  const plan = videoPlanSchema.parse(
    await readJson("output/ml-engineering/video-plan.json"),
  );
  assert.throws(
    () => alignScenes(plan, { duration: 31, alignment: null }),
    /without speeding/,
  );
  const characters = [...plan.voiceover.text];
  // Uniform character timing gives the shortened brand hook less than one
  // second. Keep that rejection covered, then model a pause after the hook.
  const uniformStarts = characters.map((_, i) => (i / characters.length) * 26);
  assert.throws(
    () =>
      alignScenes(plan, {
        duration: 26.1,
        alignment: {
          characters,
          character_start_times_seconds: uniformStarts,
          character_end_times_seconds: uniformStarts.map((v) => v + 0.02),
        },
      }),
    /Aligned scenes are too short/,
  );
  const hookEnd = plan.scenes[0].voiceover.length + 1;
  const starts = characters.map((_, i) =>
    i < hookEnd
      ? (i / hookEnd) * 0.8
      : 1.2 + ((i - hookEnd) / (characters.length - hookEnd)) * 24.8,
  );
  const aligned = alignScenes(plan, {
    duration: 26.1,
    alignment: {
      characters,
      character_start_times_seconds: starts,
      character_end_times_seconds: starts.map((v) => v + 0.02),
    },
  });
  assert.equal(videoPlanSchema.parse(aligned).totalFrames, 900);
  assert.ok(aligned.scenes[6].startFrame < 900);
});
test("TTS gate blocks all network calls and invalid media cannot pass validation", async () => {
  const plan = videoPlanSchema.parse(
    await readJson("output/ml-engineering/video-plan.json"),
  );
  const config = configSchema.parse(await readJson("automation.config.json"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "video-tts-"));
  const previous = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_VOICE_ID = "test-voice";
  try {
    await assert.rejects(
      generateVoiceover(plan, config, directory, false),
      /--allow-tts/,
    );
    const invalid = path.join(directory, "invalid.mp4");
    await writeFile(invalid, "invalid media");
    const result = await validateVideo(
      invalid,
      path.join(directory, "missing.mp3"),
      plan,
      0.5,
      false,
    );
    assert.equal(result.valid, false);
  } finally {
    if (previous === undefined) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

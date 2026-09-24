import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAutomation } from "./main";
import { OpenRouterPlanner } from "./planner-openrouter";
import { readJson, save } from "./io";
import { loadSource } from "./source-loader";
import { videoPlanSchema } from "./types";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-runner-"));
  const source = await loadSource("inputs/ml-engineering.md");
  const plan = videoPlanSchema.parse(
    await readJson("output/ml-engineering/video-plan.json"),
  );
  plan.fullVoiceover = plan.voiceover.text;
  await save(
    path.join(root, "automation.config.json"),
    await readJson("automation.config.json"),
  );
  await save(path.join(root, "themes.json"), await readJson("themes.json"));
  const queue = "* https://github.com/owner/repo/blob/main/course.md\n";
  await save(path.join(root, "video-source.md"), queue);
  return {
    root,
    source,
    plan,
    queue,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
test("remote queue plan-only uses the production planner and writes source/planner metadata without TTS", async () => {
  const f = await fixture();
  let requests = 0;
  try {
    const planner = new OpenRouterPlanner({
      apiKey: () => "fake-key-only",
      fetch: async () => {
        requests++;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: JSON.stringify(f.plan) },
                finish_reason: "stop",
              },
            ],
            usage: { total_tokens: 100 },
          }),
        );
      },
    });
    const deps = {
      sourceFetch: async () => new Response(f.source.content),
      planner,
      generateVoiceover: async () => {
        throw new Error("TTS must not run");
      },
      renderVideo: async () => {
        throw new Error("Render must not run");
      },
    };
    await runAutomation(["--plan-only"], f.root, deps);
    await runAutomation(["--plan-only"], f.root, deps);
    assert.equal(requests, 1);
    const output = path.join(f.root, "output", f.plan.slug);
    const metadata = (await readJson(
      path.join(output, "metadata.json"),
    )) as Record<string, unknown>;
    assert.equal(
      metadata.originalReference,
      "https://github.com/owner/repo/blob/main/course.md",
    );
    assert.equal(
      metadata.resolvedReference,
      "https://raw.githubusercontent.com/owner/repo/main/course.md",
    );
    assert.equal(metadata.sourceType, "remote");
    assert.equal(metadata.sourceHash, f.source.sourceHash);
    assert.equal(metadata.plannerProvider, "openrouter");
    assert.equal(metadata.totalTokens, 100);
    assert.ok(metadata.planHash);
    assert.ok(metadata.generatedAt);
    assert.ok(metadata.fetchedAt);
    assert.equal(
      await readFile(path.join(output, "source.md"), "utf8"),
      f.source.content,
    );
    assert.equal(
      await readFile(path.join(output, "voiceover.txt"), "utf8"),
      f.plan.voiceover.text + "\n",
    );
    assert.equal(
      await readFile(path.join(f.root, "video-source.md"), "utf8"),
      f.queue,
    );
  } finally {
    await f.cleanup();
  }
});
test("invalid remote planner output stops the runner before TTS and preserves pending queue/source snapshot", async () => {
  const f = await fixture();
  let downstreamCalls = 0;
  try {
    const planner = new OpenRouterPlanner({
      apiKey: () => "fake-key-only",
      fetch: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        ),
    });
    await assert.rejects(
      runAutomation([], f.root, {
        sourceFetch: async () => new Response(f.source.content),
        planner,
        generateVoiceover: async () => {
          downstreamCalls++;
          throw new Error("must not run");
        },
      }),
      /schema validation/,
    );
    assert.equal(downstreamCalls, 0);
    assert.equal(
      await readFile(path.join(f.root, "video-source.md"), "utf8"),
      f.queue,
    );
    assert.equal(
      await readFile(
        path.join(f.root, "output", f.plan.slug, "source.md"),
        "utf8",
      ),
      f.source.content,
    );
  } finally {
    await f.cleanup();
  }
});
test("remote runner sends only narration to TTS and marks done only after successful final validation", async () => {
  for (const valid of [false, true]) {
    const f = await fixture();
    const events: string[] = [];
    try {
      // A local one-second PCM fixture makes asset probing real without speech generation.
      const samples = 8000;
      const wav = Buffer.alloc(44 + samples * 2);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24);
      wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(samples * 2, 40);
      const audioFile = path.join(f.root, "test.wav");
      await writeFile(audioFile, wav);
      const characters = [...f.plan.voiceover.text];
      const hookEnd = f.plan.scenes[0].voiceover.length + 1;
      const times = characters.map((_, i) =>
        i < hookEnd
          ? (i / hookEnd) * 0.8
          : 1.2 + ((i - hookEnd) / (characters.length - hookEnd)) * 24.8,
      );
      const planner = new OpenRouterPlanner({
        apiKey: () => "fake-key-only",
        fetch: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(f.plan) } }],
            }),
          ),
      });
      const run = runAutomation([], f.root, {
        sourceFetch: async () => new Response(f.source.content),
        planner,
        generateVoiceover: async (plan, _config, _directory, allowed) => {
          events.push("tts");
          assert.equal(allowed, true);
          assert.equal(
            plan.voiceover.text,
            (
              await readFile(
                path.join(f.root, "output", plan.slug, "voiceover.txt"),
                "utf8",
              )
            ).trim(),
          );
          assert.ok(!plan.voiceover.text.includes("##"));
          return {
            file: audioFile,
            duration: 26.1,
            cached: false,
            alignment: {
              characters,
              character_start_times_seconds: times,
              character_end_times_seconds: times.map((t) => t + 0.02),
            },
          };
        },
        renderVideo: async (_root, directory, props) => {
          events.push("render");
          assert.equal(props.plan.totalFrames, 900);
          assert.ok(props.audio.voiceover);
          await mkdir(directory, { recursive: true });
          const output = path.join(directory, "final.mp4");
          await writeFile(output, "mock render");
          return output;
        },
        validateVideo: async () => {
          events.push("validate");
          assert.equal(
            await readFile(path.join(f.root, "video-source.md"), "utf8"),
            f.queue,
          );
          return {
            valid,
            checks: { video: valid },
            errors: valid ? [] : ["mock validation failed"],
          };
        },
      });
      if (valid) await run;
      else await assert.rejects(run, /mock validation failed/);
      assert.deepEqual(events, ["tts", "render", "validate"]);
      assert.equal(
        (await readFile(path.join(f.root, "video-source.md"), "utf8")).includes(
          "<!-- done -->",
        ),
        valid,
      );
    } finally {
      await f.cleanup();
    }
  }
});

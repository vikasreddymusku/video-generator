import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAutomation } from "./main";
import { createUserVideoPlan } from "./hybrid-inputs";
import { hash } from "./io";
import type { VideoPlan } from "./types";
import type { SourceDocument } from "./source-loader";
import type { Probe } from "./media";

function wavBytes(seconds = 1) {
  const samples = 8000 * seconds;
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
  return wav;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hybrid-runner-"));
  await copyFile("automation.config.json", path.join(root, "automation.config.json"));
  await copyFile("themes.json", path.join(root, "themes.json"));
  await mkdir(path.join(root, "public"), { recursive: true });
  const audio = path.join(root, "narration.wav");
  await writeFile(audio, wavBytes());
  const video = path.join(root, "source.mp4");
  await writeFile(video, Buffer.from("fake-video"));
  const source: SourceDocument = {
    type: "local",
    originalReference: "source.md",
    resolvedReference: "source.md",
    content: "# Hybrid Demo\\n\\nThis is a source-backed lesson.",
    sourceHash: hash("# Hybrid Demo\\n\\nThis is a source-backed lesson."),
    sourceName: "source.md",
    fetchedAt: new Date().toISOString(),
  };
  return {
    root,
    audio,
    video,
    source,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function planFor(source: SourceDocument, external: boolean) {
  const metadata = {
    title: "Hybrid Demo", slug: "hybrid-demo", brand: "TINITIATE AI",
    duration_mode: "auto" as const, fps: 30, resolution: "1920x1080",
    theme: "tinitiate-dark-yellow", voiceover_mode: "auto" as const,
    video_type: "course-promo", cta: "ENROLL NOW", website: "https://example.com",
    email: "hello@example.com", phone: "000", address: "Remote", tagline: "Learn.",
  };
  const content = {
    frontmatter: {}, metadata, body: source.content, sourceHash: source.sourceHash,
    originalReference: source.originalReference, resolvedReference: source.resolvedReference,
    sourceType: source.type, fetchedAt: source.fetchedAt, sourceName: source.sourceName,
    raw: source.content, sections: {}, audience: "", positioning: "", courseContent: "",
    technologies: "", projects: "", benefits: "", suppliedVoiceover: "",
  } as any;
  return createUserVideoPlan(content, 2, external ? "" : "Generated narration.", external);
}

test("Phase 7 unified runner exercises all six combinations without provider calls", async () => {
  const combinations = [
    ["AI", "AI_SCRIPT"],
    ["AI", "USER_SCRIPT"],
    ["AI", "USER_AUDIO"],
    ["USER_VIDEO", "AI_SCRIPT"],
    ["USER_VIDEO", "USER_SCRIPT"],
    ["USER_VIDEO", "USER_AUDIO"],
  ] as const;
  for (const [visualSource, narrationSource] of combinations) {
    const f = await fixture();
    const calls: string[] = [];
    try {
      const external = narrationSource !== "AI_SCRIPT";
      const basePlan = planFor(f.source, external);
      const deps = {
        sourceDocument: f.source,
        planner: {
          createVideoPlan: async () => basePlan,
        },
        probe: async (_file: string) => ({
          format: { duration: "2" },
          streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1", nb_frames: "60" }],
        }) as Probe,
        analyzeUserVideo: async () => ({
          title: "Analyzed Video", narration: "Generated video narration.",
          durationSeconds: 2, width: 1920, height: 1080, hasAudio: true,
        }),
        audioDuration: async () => 1,
        generateVoiceover: async (plan: VideoPlan) => {
          calls.push("tts");
          const characters = [...plan.voiceover.text];
          const starts = characters.map((_, index) => index * 0.01);
          return {
            file: f.audio, duration: 1, cached: false,
            alignment: {
              characters,
              character_start_times_seconds: starts,
              character_end_times_seconds: starts.map((value) => value + 0.005),
            },
          };
        },
        renderVideo: async (_root: string, directory: string, props: any) => {
          calls.push("render");
          if (visualSource === "USER_VIDEO") assert.ok(props.hybrid?.userVideoAsset);
          else assert.equal(props.hybrid?.visualSource, "AI");
          await mkdir(directory, { recursive: true });
          const output = path.join(directory, "final.mp4");
          await writeFile(output, "mock");
          return output;
        },
        validateVideo: async () => {
          calls.push("validate");
          return { valid: true, checks: { mock: true }, errors: [] };
        },
        jobOptions: {
          slug: "hybrid-demo", durationMode: "auto" as const,
          hybrid: {
            visualSource, narrationSource,
            userVideoFile: visualSource === "USER_VIDEO" ? f.video : undefined,
            userNarrationAudioFile: narrationSource === "USER_AUDIO" ? f.audio : undefined,
            userNarrationScript: narrationSource === "USER_SCRIPT" ? "Exact supplied script." : undefined,
          },
        },
      };
      await runAutomation(["--source", "source.md"], f.root, deps);
      assert.ok(calls.includes("render"));
      assert.ok(calls.includes("validate"));
      assert.equal(calls.includes("tts"), narrationSource !== "USER_AUDIO");
      if (narrationSource === "USER_SCRIPT") {
        assert.equal(
          await readFile(path.join(f.root, "output", "jobs", "hybrid-demo", "voiceover.txt"), "utf8"),
          "Exact supplied script.",
        );
      }
      if (narrationSource === "USER_AUDIO") {
        assert.equal(calls.includes("tts"), false);
      }
    } finally {
      await f.cleanup();
    }
  }
});
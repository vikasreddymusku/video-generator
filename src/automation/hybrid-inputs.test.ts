import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignExternalAudio,
  applyUserNarrationScript,
  createUserVideoPlan,
  resolveHybridCapabilities,
} from "./hybrid-inputs";
import type { ContentInput } from "./load-content";

function content(): ContentInput {
  return {
    frontmatter: {},
    metadata: {
      title: "Hybrid Demo",
      slug: "hybrid-demo",
      brand: "TINITIATE AI",
      duration_mode: "auto" as const,
      fps: 30,
      resolution: "1920x1080",
      theme: "tinitiate-dark-yellow",
      voiceover_mode: "auto" as const,
      video_type: "course-promo",
      cta: "ENROLL NOW",
      website: "https://example.com",
      email: "hello@example.com",
      phone: "000",
      address: "Remote",
      tagline: "Learn.",
    },
    body: "# Hybrid Demo",
    sourceHash: "source-hash",
    originalReference: "video.mp4",
    resolvedReference: "video.mp4",
    sourceType: "local",
    fetchedAt: new Date().toISOString(),
    sourceName: "video.mp4",
    raw: "# Hybrid Demo",
    sections: {},
    audience: "",
    positioning: "",
    courseContent: "",
    technologies: "",
    projects: "",
    benefits: "",
    suppliedVoiceover: "",
  };
}

test("Phase 7 capability matrix covers all six combinations", () => {
  const cases = [
    ["AI", "AI_SCRIPT", true, false, false, true],
    ["AI", "USER_SCRIPT", true, false, false, true],
    ["AI", "USER_AUDIO", true, false, false, false],
    ["USER_VIDEO", "AI_SCRIPT", false, true, true, true],
    ["USER_VIDEO", "USER_SCRIPT", false, true, false, true],
    ["USER_VIDEO", "USER_AUDIO", false, true, false, false],
  ] as const;
  for (const [visualSource, narrationSource, planner, video, analysis, tts] of cases) {
    const capabilities = resolveHybridCapabilities({ visualSource, narrationSource });
    assert.equal(capabilities.needsVisualPlanner, planner);
    assert.equal(capabilities.usesUserVideo, video);
    assert.equal(capabilities.needsVideoAnalysis, analysis);
    assert.equal(capabilities.needsTts, tts);
  }
});

test("user narration script is preserved verbatim while allocated to scenes", () => {
  const base = createUserVideoPlan(content(), 10, "", true);
  base.scenes.push({
    ...base.scenes[0],
    id: "second",
    startFrame: 150,
    durationInFrames: 150,
  });
  base.scenes[0].durationInFrames = 150;
  const script = "First exact sentence. Second exact sentence.";
  const result = applyUserNarrationScript(base, script);
  assert.equal(result.voiceover.text, script);
  assert.equal(result.fullVoiceover, script);
  assert.equal(result.narrationExternal, true);
  assert.equal(result.scenes.map((scene) => scene.voiceover).join(""), script);
});

test("external audio can extend auto duration without changing authored words", () => {
  const base = createUserVideoPlan(content(), 10, "", true);
  const result = alignExternalAudio(base, 14.2, "auto", 0.5);
  assert.equal(result.totalFrames, Math.ceil(14.7 * 30));
  assert.equal(result.durationSeconds, result.totalFrames / 30);
  assert.equal(result.narrationExternal, true);
});

test("fixed duration rejects narration audio that cannot fit", () => {
  const base = {
    ...createUserVideoPlan(content(), 10, "", true),
    durationSeconds: 10,
    totalFrames: 300,
  };
  assert.throws(
    () => alignExternalAudio(base, 9.7, "fixed", 0.5),
    /exceeds the fixed video duration/,
  );
});
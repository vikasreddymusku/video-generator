import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { VideoPlan } from "./types";
import type { ContentInput } from "./load-content";
import { hash } from "./io";

export type HybridJobInputs = {
  visualSource: "AI" | "USER_VIDEO";
  narrationSource: "AI_SCRIPT" | "USER_SCRIPT" | "USER_AUDIO";
  userVideoFile?: string;
  userNarrationAudioFile?: string;
  userNarrationScript?: string;
  userVideoMimeType?: string;
};

export function resolveHybridCapabilities(inputs?: HybridJobInputs) {
  const visualSource = inputs?.visualSource ?? "AI";
  const narrationSource = inputs?.narrationSource ?? "AI_SCRIPT";
  return {
    visualSource,
    narrationSource,
    usesUserVideo: visualSource === "USER_VIDEO",
    usesUserNarrationScript: narrationSource === "USER_SCRIPT",
    usesUserNarrationAudio: narrationSource === "USER_AUDIO",
    needsVideoAnalysis:
      visualSource === "USER_VIDEO" &&
      narrationSource === "AI_SCRIPT",
    needsVisualPlanner: visualSource === "AI",
    needsTts: narrationSource !== "USER_AUDIO",
  } as const;
}

export function assertHybridInputs(inputs: HybridJobInputs) {
  if (inputs.visualSource === "USER_VIDEO" && !inputs.userVideoFile) {
    throw new Error("A user video is required when visual source is USER_VIDEO.");
  }
  if (inputs.narrationSource === "USER_SCRIPT") {
    if (!inputs.userNarrationScript?.trim()) {
      throw new Error("Narration script cannot be empty.");
    }
  }
  if (inputs.narrationSource === "USER_AUDIO" && !inputs.userNarrationAudioFile) {
    throw new Error("Narration audio is required when narration source is USER_AUDIO.");
  }
}

export async function stageHybridAsset(
  root: string,
  slug: string,
  sourceFile: string,
  kind: "video" | "narration",
) {
  const extension = path.extname(sourceFile).toLowerCase();
  const allowed =
    kind === "video"
      ? new Set([".mp4", ".webm", ".mov"])
      : new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"]);
  if (!allowed.has(extension)) {
    throw new Error(
      kind === "video"
        ? "The uploaded video format is not supported."
        : "The uploaded narration audio format is not supported.",
    );
  }
  const relative = `generated/${slug}/${kind}${extension}`;
  const destination = path.join(root, "public", relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(sourceFile, destination);
  return relative;
}

function scriptSlices(script: string, count: number, weights: number[]) {
  const matches = [...script.matchAll(/\S+\s*/g)];
  if (!matches.length) return Array.from({ length: count }, () => "");
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || count;
  const slices: string[] = [];
  let wordStart = 0;
  let previousWordEnd = 0;

  for (let i = 0; i < count; i++) {
    const remainingScenes = count - i;
    const remainingWords = matches.length - wordStart;
    if (i === count - 1) {
      slices.push(script.slice(matches[wordStart]?.index ?? previousWordEnd));
      break;
    }
    const target = Math.max(
      0,
      Math.round((weights[i] / totalWeight) * matches.length),
    );
    const minimum = remainingWords >= remainingScenes ? 1 : 0;
    const wordsForScene = Math.min(
      remainingWords - (remainingScenes - 1) * minimum,
      Math.max(minimum, target),
    );
    const endWord = Math.min(matches.length, wordStart + wordsForScene);
    const endOffset =
      endWord > wordStart
        ? (matches[endWord - 1].index ?? previousWordEnd) +
          matches[endWord - 1][0].length
        : previousWordEnd;
    slices.push(script.slice(previousWordEnd, endOffset));
    previousWordEnd = endOffset;
    wordStart = endWord;
  }

  while (slices.length < count) slices.push("");
  return slices;
}

export function applyUserNarrationScript(
  plan: VideoPlan,
  script: string,
): VideoPlan {
  if (!script.trim()) throw new Error("Narration script cannot be empty.");
  const weights = plan.scenes.map((scene) => scene.durationInFrames);
  const slices = scriptSlices(script, plan.scenes.length, weights);
  return {
    ...plan,
    narrationExternal: true,
    voiceover: { mode: "continuous", text: script },
    fullVoiceover: script,
    scenes: plan.scenes.map((scene, index) => ({
      ...scene,
      voiceover: slices[index] ?? "",
    })),
  };
}

export function alignExternalAudio(
  plan: VideoPlan,
  audioDuration: number,
  durationMode: "auto" | "fixed",
  endingBufferSeconds: number,
) {
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) {
    throw new Error("Narration audio duration is invalid.");
  }
  if (
    durationMode === "fixed" &&
    audioDuration > plan.durationSeconds - endingBufferSeconds
  ) {
    throw new Error(
      `Narration audio is ${audioDuration.toFixed(2)}s; it exceeds the fixed video duration without speeding up.`,
    );
  }

  const requiredFrames = Math.ceil(
    (audioDuration + endingBufferSeconds) * plan.fps,
  );
  const totalFrames =
    durationMode === "auto"
      ? Math.max(plan.totalFrames, requiredFrames)
      : plan.totalFrames;
  const oldTotal = plan.totalFrames;
  let allocated = 0;
  const scenes = plan.scenes.map((scene, index) => {
    if (index === plan.scenes.length - 1) {
      return {
        ...scene,
        startFrame: allocated,
        durationInFrames: totalFrames - allocated,
      };
    }
    const proportional = Math.max(
      1,
      Math.round((scene.durationInFrames / oldTotal) * totalFrames),
    );
    const duration = Math.min(
      proportional,
      totalFrames - allocated - (plan.scenes.length - index - 1),
    );
    const next = {
      ...scene,
      startFrame: allocated,
      durationInFrames: duration,
    };
    allocated += duration;
    return next;
  });

  if (scenes.some((scene) => scene.durationInFrames < 1)) {
    throw new Error("External narration timing could not fit the visual plan.");
  }

  return {
    ...plan,
    durationSeconds: totalFrames / plan.fps,
    totalFrames,
    scenes,
  };
}

export function createUserVideoPlan(
  content: ContentInput,
  durationSeconds: number,
  narrationText: string,
  narrationExternal: boolean,
): VideoPlan {
  const fps = content.metadata.fps;
  const [width, height] = content.metadata.resolution.split("x").map(Number);
  const requestedDuration =
    content.metadata.duration_mode === "fixed"
      ? content.metadata.duration_seconds ?? durationSeconds
      : durationSeconds;
  if (
    content.metadata.duration_mode === "fixed" &&
    requestedDuration < durationSeconds
  ) {
    throw new Error(
      `The fixed duration (${requestedDuration}s) is shorter than the supplied video (${durationSeconds.toFixed(2)}s).`,
    );
  }
  const totalFrames = Math.max(1, Math.ceil(requestedDuration * fps));
  const duration = totalFrames / fps;
  const sceneVoiceover = narrationExternal ? "" : narrationText;

  return {
    version: 1,
    compositionId: "UserVideoPlan",
    slug: content.metadata.slug,
    title: content.metadata.title,
    brand: content.metadata.brand,
    sourceHash: content.sourceHash,
    durationSeconds: duration,
    fps,
    width,
    height,
    totalFrames,
    theme: content.metadata.theme,
    voiceover: { mode: "continuous", text: narrationExternal ? "" : narrationText },
    narrationExternal,
    fullVoiceover: narrationExternal ? "" : narrationText,
    contact: {
      cta: content.metadata.cta,
      website: content.metadata.website,
      email: content.metadata.email,
      phone: content.metadata.phone,
      address: content.metadata.address,
      tagline: content.metadata.tagline,
    },
    scenes: [
      {
        id: "user-video",
        type: "hero-title",
        startFrame: 0,
        durationInFrames: totalFrames,
        headline: content.metadata.title,
        supportingText: [],
        items: [],
        visualConcept: "User-provided video is the authoritative visual source.",
        animationDirection: "scale",
        voiceover: sceneVoiceover,
        transition: "fade",
        suggestedSfx: [],
        code: null,
        diagram: null,
        metrics: null,
      },
    ],
  };
}

export async function hybridSourceHash(file: string) {
  return hash(await readFile(file));
}

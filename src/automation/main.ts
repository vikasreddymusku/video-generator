import dotenv from "dotenv";
import path from "node:path";
import { readFile, open, unlink, mkdir, appendFile } from "node:fs/promises";
import { configSchema, themeCatalogSchema, videoPlanSchema } from "./types";
import { localPath, readJson, save, hash } from "./io";
import { loadQueue, markDone } from "./queue";
import { parseContent } from "./load-content";
import { loadSource, isRemoteReference, type SourceDocument } from "./source-loader";
import { assertNarration } from "./narration";
import { audioDuration, probe } from "./media";
import {
  alignExternalAudio,
  applyUserNarrationScript,
  assertHybridInputs,
  createUserVideoPlan,
  stageHybridAsset,
} from "./hybrid-inputs";
import { analyzeUserVideo } from "./video-analysis";
import type { Planner } from "./planner";
import { CodexTestPlanner } from "./planner";
import { OpenRouterPlanner } from "./planner-openrouter";
import { generateVoiceover, alignScenes } from "./tts-elevenlabs";
import { prepareAssets } from "./assets";
import { renderVideo } from "./render";
import { validateVideo } from "./validate";
import {
  applyBrandingTiming,
  prepareBrandingAssets,
  resolveBranding,
  stripBrandingTiming,
} from "./branding";
import type { BrandingOverride, ResolvedBranding } from "./types";

export async function runAutomation(
  args = process.argv.slice(2),
  root = process.cwd(),
  dependencies: {
    sourceFetch?: typeof fetch;
    planner?: Planner;
    generateVoiceover?: typeof generateVoiceover;
    renderVideo?: typeof renderVideo;
    validateVideo?: typeof validateVideo;
    sourceDocument?: SourceDocument;
    jobOptions?: {
      slug: string;
      durationMode: "auto" | "fixed";
      durationSeconds?: number;
      branding?: ResolvedBranding;
      brandingOverride?: BrandingOverride;
      hybrid?: {
        visualSource: "AI" | "USER_VIDEO";
        narrationSource: "AI_SCRIPT" | "USER_SCRIPT" | "USER_AUDIO";
        userVideoFile?: string;
        userNarrationAudioFile?: string;
        userNarrationScript?: string;
        userVideoMimeType?: string;
      };
    };
    onAudio?: (duration: number) => Promise<void>;
    onStage?: (stage: "PLANNING" | "NARRATION_PREPARED" | "GENERATING_VOICE" | "ALIGNING_TIMING" | "RENDERING" | "VALIDATING" | "COMPLETED") => void;
  } = {},
) {
  dotenv.config({ path: path.join(root, ".env"), quiet: true });
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith("--")))
      throw new Error(`Missing value for ${flag}`);
    return i < 0 ? undefined : args[i + 1];
  };
  const preview = args.includes("--preview");
  const force = args.includes("--force");
  const validateOnly = args.includes("--validate");
  const planOnly = args.includes("--plan-only");
  if ([preview, validateOnly, planOnly].filter(Boolean).length > 1)
    throw new Error("Choose only one of --preview, --validate or --plan-only.");
  const config = configSchema.parse(
    await readJson(path.join(root, "automation.config.json")),
  );
  if (value("--output-dir")) config.render.outputDir = value("--output-dir")!;
  const codexMode =
    args.includes("--codex-test") ||
    config.planner.mode === "codex-test" ||
    preview ||
    validateOnly;
  const themes = themeCatalogSchema.parse(
    await readJson(path.join(root, "themes.json")),
  );
  const brandingFor = (title: string, fps: number) =>
    prepareBrandingAssets(
      root,
      dependencies.jobOptions?.branding ??
        resolveBranding(
          config,
          title,
          fps,
          dependencies.jobOptions?.brandingOverride,
        ),
    );
  const queueFile = path.join(root, "video-source.md");
  const selected = value("--input");
  const standalone = value("--source");
  if (selected && standalone)
    throw new Error(
      "Use --input to select a queue item or --source for a standalone source, not both.",
    );
  const referenceIdentity = (reference: string) =>
    isRemoteReference(reference) ? reference : path.resolve(root, reference);
  const items = standalone
    ? [{ source: standalone, line: -1, original: "", done: false }]
    : (await loadQueue(queueFile, force || validateOnly || preview)).filter(
        (i) =>
          !selected ||
          referenceIdentity(i.source) === referenceIdentity(selected),
      );
  if (!items.length) {
    console.log("No matching pending queue items.");
    return;
  }
  const lockFile = path.join(root, "output", ".automation.lock");
  await mkdir(path.dirname(lockFile), { recursive: true });
  let lock;
  try {
    lock = await open(lockFile, "wx");
  } catch {
    throw new Error(
      "Another automation run is active (output/.automation.lock). If a prior process crashed, verify it has stopped before removing its lock.",
    );
  }
  try {
    for (const item of items) {
      const content = parseContent(
        dependencies.sourceDocument ?? await loadSource(item.source, {
          root,
          fetch: dependencies.sourceFetch,
        }),
        { config, themes, themeOverride: value("--theme") },
      );
      const hybrid = dependencies.jobOptions?.hybrid;
      if (hybrid) assertHybridInputs(hybrid);
      if (dependencies.jobOptions) {
        content.metadata.slug = dependencies.jobOptions.slug;
        content.metadata.duration_mode = dependencies.jobOptions.durationMode;
        content.metadata.duration_seconds = dependencies.jobOptions.durationSeconds;
      }
      let branding = await brandingFor(
        content.metadata.title,
        content.metadata.fps,
      );
      const directory = localPath(
        root,
        path.join(config.render.outputDir, content.metadata.slug),
      );
      await mkdir(path.join(directory, "logs"), { recursive: true });
      const log = (message: string) =>
        appendFile(path.join(directory, "logs", "run.log"), message + "\n");
      try {
        const themeId =
          value("--theme") ?? content.metadata.theme ?? themes.active;
        const theme = themes.themes[themeId];
        if (!theme) throw new Error(`Unknown theme: ${themeId}`);
        // Snapshot the bytes used for planning even if planning subsequently fails.
        await save(path.join(directory, "source.md"), content.raw);
        await save(path.join(directory, "metadata.json"), content);
        const planner: Planner =
          dependencies.planner ??
          (codexMode ? new CodexTestPlanner() : new OpenRouterPlanner());
        dependencies.onStage?.("PLANNING");
        let plan;
        let plannerMetadata = planner.metadata;
        if (hybrid?.visualSource === "USER_VIDEO") {
          const videoFile = hybrid.userVideoFile!;
          const analysis =
            hybrid.narrationSource === "AI_SCRIPT"
              ? await analyzeUserVideo(videoFile, config)
              : await (async () => {
                  const video = await probe(videoFile);
                  const stream = video.streams.find((s) => s.codec_type === "video");
                  return {
                    durationSeconds: Number(video.format.duration),
                    width: stream?.width,
                    height: stream?.height,
                    hasAudio: video.streams.some((s) => s.codec_type === "audio"),
                    narration: "",
                  };
                })();
          if (hybrid.narrationSource === "AI_SCRIPT") {
            await save(path.join(directory, "video-analysis.json"), analysis);
          }
          plan = createUserVideoPlan(
            content,
            analysis.durationSeconds,
            analysis.narration,
            hybrid.narrationSource !== "AI_SCRIPT",
          );
          if (hybrid.narrationSource === "USER_SCRIPT") {
            plan = applyUserNarrationScript(
              plan,
              hybrid.userNarrationScript!,
            );
          }
        } else {
          plan = await planner.createVideoPlan({
            content,
            config,
            themeId,
            theme,
            planFile: path.join(directory, "video-plan.json"),
            hybrid,
          });
          plannerMetadata = planner.metadata;
          if (
            hybrid?.narrationSource === "USER_SCRIPT"
          ) {
            plan = applyUserNarrationScript(
              plan,
              hybrid.userNarrationScript!,
            );
          }
        }
        branding = { ...branding, videoTitle: plan.title };
        await save(path.join(directory, "metadata.json"), {
          ...content,
          ...plannerMetadata,
        });
        await save(
          path.join(directory, "voiceover.txt"),
          plan.voiceover.text ? plan.voiceover.text + "\n" : "",
        );
        if (preview) {
          plan = applyBrandingTiming(plan, branding);
          await save(path.join(root, "src", "generated", "preview.json"), {
            plan,
            theme,
            audio: await prepareAssets(root, plan.slug),
            mix: config.audio,
            branding,
          });
          await log("Visual preview prepared without TTS.");
          console.log(
            `Preview ready: ${plan.compositionId}; ${plan.scenes.length} scenes; ${plan.totalFrames} frames; ${plan.theme}`,
          );
          continue;
        }
        const voiceFile = path.join(directory, "audio", "voiceover.mp3");
        if (validateOnly) {
          const timing = videoPlanSchema.parse(
            await readJson(path.join(directory, "render-plan.json")),
          );
          const timingWithoutBranding = stripBrandingTiming(timing, branding);
          if (
  content.metadata.duration_mode ===
    "fixed" &&
  (timingWithoutBranding.durationSeconds !==
    plan.durationSeconds ||
    timingWithoutBranding.totalFrames !==
      plan.totalFrames)
) {
  throw new Error(
    "Fixed-duration render timing no longer matches the authored plan.",
  );
}

if (
  content.metadata.duration_mode ===
    "auto" &&
  timingWithoutBranding.totalFrames <
    plan.totalFrames
) {
  throw new Error(
    "Auto-duration render plan cannot be shorter than the authored plan.",
  );
}

const normalizedTiming = {
  ...timingWithoutBranding,

  /*
   * Only post-TTS timing is allowed to differ.
   * Normalize those timing fields back to the
   * authored plan before comparing everything else.
   */
  durationSeconds:
    plan.durationSeconds,

  totalFrames:
    plan.totalFrames,

  scenes:
    timingWithoutBranding.scenes.map(
      (scene, index) => ({
        ...scene,

        startFrame:
          plan.scenes[index]
            ?.startFrame,

        durationInFrames:
          plan.scenes[index]
            ?.durationInFrames,
      }),
    ),
};
          if (JSON.stringify(normalizedTiming) !== JSON.stringify(plan))
            throw new Error(
              "Render plan no longer matches the authored plan. Render again before validation.",
            );
          const receipt = (await readJson(
            path.join(directory, "renders", "render-receipt.json"),
          )) as { succeeded: boolean; outputHash: string };
          const final = path.join(directory, "renders", "final.mp4");
          const result = await validateVideo(
            final,
            voiceFile,
            timing,
            config.validation.durationToleranceSeconds,
            receipt.succeeded &&
              receipt.outputHash === hash(await readFile(final)),
          );
          await save(path.join(directory, "validation.json"), result);
          if (!result.valid) throw new Error(result.errors.join("\n"));
          console.log("Validation passed (queue unchanged).");
          continue;
        }
        const narrationSource =
          hybrid?.narrationSource ?? "AI_SCRIPT";
        if (narrationSource === "USER_AUDIO") {
          const duration = await audioDuration(hybrid!.userNarrationAudioFile!);
          await save(path.join(directory, "narration-budget.json"), {
            source: "USER_AUDIO",
            duration,
          });
        } else {
          const narrationMode =
            narrationSource === "USER_SCRIPT"
              ? "supplied"
              : content.metadata.voiceover_mode;
          if (
            content.metadata.duration_mode === "fixed" ||
            narrationSource === "AI_SCRIPT"
          ) {
            const narration = assertNarration(
              plan.voiceover.text,
              plan.durationSeconds,
              config,
              narrationMode,
            );
            await save(path.join(directory, "narration-budget.json"), narration);
          }
        }
        dependencies.onStage?.("NARRATION_PREPARED");
        if (planOnly) {
          console.log(
            `Plan ready: ${plan.slug}; ${narration.wordCount} narration words; estimated ${narration.estimatedSeconds.toFixed(2)}s including pauses. No TTS or render requested.`,
          );
          continue;
        }
        let voiceFile: string;
        let audio: {
          file: string;
          duration: number;
          alignment: Awaited<ReturnType<typeof generateVoiceover>>["alignment"];
          cached: boolean;
        };
        if (narrationSource === "USER_AUDIO") {
          voiceFile = hybrid!.userNarrationAudioFile!;
          audio = {
            file: voiceFile,
            duration: await audioDuration(voiceFile),
            alignment: null,
            cached: true,
          };
        } else {
          if (!config.tts.enabled)
            throw new Error(
              "Narrated rendering requires tts.enabled=true; use --preview for silent visuals.",
            );
          const voiceoverText = (
            await readFile(path.join(directory, "voiceover.txt"), "utf8")
          ).replace(/\r\n/g, "\n");
          if (voiceoverText !== plan.voiceover.text)
            throw new Error(
              "voiceover.txt changed after planning; refusing TTS.",
            );
          dependencies.onStage?.("GENERATING_VOICE");
          audio = await (
            dependencies.generateVoiceover ?? generateVoiceover
          )(
            { ...plan, voiceover: { ...plan.voiceover, text: voiceoverText } },
            config,
            path.join(directory, "audio"),
            !codexMode || args.includes("--allow-tts"),
          );
          voiceFile = audio.file;
        }
        dependencies.onStage?.("ALIGNING_TIMING");
        await dependencies.onAudio?.(audio.duration);
        plan = videoPlanSchema.parse(
          narrationSource === "USER_AUDIO"
            ? alignExternalAudio(
                plan,
                audio.duration,
                content.metadata.duration_mode,
                config.narration.endingBufferSeconds,
              )
            : alignScenes(plan, audio, {
                durationMode: content.metadata.duration_mode,
                endingBufferSeconds: config.narration.endingBufferSeconds,
              }),
        );
        plan = applyBrandingTiming(plan, branding);
        const runtimeHybrid = hybrid
          ? {
              visualSource: hybrid.visualSource,
              narrationSource: hybrid.narrationSource,
              ...(hybrid.userVideoFile
                ? {
                    userVideoAsset: await stageHybridAsset(
                      root,
                      plan.slug,
                      hybrid.userVideoFile,
                      "video",
                    ),
                  }
                : {}),
              ...(hybrid.narrationSource === "USER_AUDIO"
                ? {
                    userNarrationAudioAsset: await stageHybridAsset(
                      root,
                      plan.slug,
                      hybrid.userNarrationAudioFile!,
                      "narration",
                    ),
                  }
                : {}),
              userVideoVolume: 0.15,
            }
          : undefined;
        await save(path.join(directory, "render-plan.json"), plan);
        const props = {
          plan,
          theme,
          audio: await prepareAssets(root, plan.slug, voiceFile),
          mix: config.audio,
          branding,
          hybrid: runtimeHybrid,
        };
        dependencies.onStage?.("RENDERING");
        const output = await (dependencies.renderVideo ?? renderVideo)(
          root,
          path.join(directory, "renders"),
          props,
          voiceFile,
          config.validation.durationToleranceSeconds,
          force,
        );
        dependencies.onStage?.("VALIDATING");
        const result = await (dependencies.validateVideo ?? validateVideo)(
          output,
          voiceFile,
          plan,
          config.validation.durationToleranceSeconds,
          true,
        );
        await save(path.join(directory, "validation.json"), result);
        if (!result.valid) throw new Error(result.errors.join("\n"));
        if (item.line >= 0) await markDone(queueFile, item, result);
        await log(
          item.line >= 0
            ? "Render validated; queue item done."
            : "Standalone render validated; queue unchanged.",
        );
        console.log(`Completed: ${output}`);
        dependencies.onStage?.("COMPLETED");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await log(message);
        throw error;
      }
    }
  } finally {
    await lock.close();
    await unlink(lockFile);
  }
}
if (
  path.resolve(process.argv[1] ?? "") === path.resolve("src/automation/main.ts")
) {
  runAutomation().catch((error) => {
    let message = error instanceof Error ? error.message : String(error);
    for (const key of [
      process.env.OPENROUTER_API_KEY,
      process.env.ELEVENLABS_API_KEY,
    ])
      if (key) message = message.split(key).join("[REDACTED]");
    console.error(message);
    process.exitCode = 1;
  });
}

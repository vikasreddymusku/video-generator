import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { hash, readJson, save } from "./io";
import { audioDuration } from "./media";
import type { AutomationConfig, VideoPlan } from "./types";

const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(
    z.number().finite().nonnegative(),
  ),
  character_end_times_seconds: z.array(
    z.number().finite().nonnegative(),
  ),
});

const responseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: alignmentSchema.nullable(),
});

type Alignment = z.infer<typeof alignmentSchema>;

export type VoiceoverResult = {
  file: string;
  duration: number;
  alignment: Alignment | null;
  cached: boolean;
};

export type AlignScenesOptions = {
  durationMode?: "auto" | "fixed";
  endingBufferSeconds?: number;
};

export async function generateVoiceover(
  plan: VideoPlan,
  config: AutomationConfig,
  directory: string,
  allowTts: boolean,
): Promise<VoiceoverResult> {
  const voice =
    process.env.ELEVENLABS_VOICE_ID ||
    config.tts.voiceId;

  if (!voice) {
    throw new Error(
      "Set ELEVENLABS_VOICE_ID in .env (or tts.voiceId in config).",
    );
  }

  const request = {
    text: plan.voiceover.text,
    model_id: config.tts.modelId,

    ...(config.tts.voiceSettings
      ? {
          voice_settings:
            config.tts.voiceSettings,
        }
      : {}),
  };

  const fingerprint = hash(
    JSON.stringify({
      request,
      voice,
      format: config.tts.outputFormat,
    }),
  );

  const file = path.join(
    directory,
    "voiceover.mp3",
  );

  const cacheFile = path.join(
    directory,
    "cache.json",
  );

  const cacheSchema = z.object({
    hash: z.string(),
    audioHash: z.string(),
    alignment:
      alignmentSchema.nullable(),
  });

  /*
   * Reuse TTS when narration, voice, model and
   * relevant voice settings are unchanged.
   */
  try {
    const cache = cacheSchema.parse(
      await readJson(cacheFile),
    );

    if (
      cache.hash === fingerprint &&
      cache.audioHash ===
        hash(await readFile(file))
    ) {
      return {
        file,
        duration:
          await audioDuration(file),
        alignment:
          cache.alignment,
        cached: true,
      };
    }
  } catch {
    /*
     * Missing, corrupt or stale cache means TTS
     * generation must continue normally.
     */
  }

  if (!allowTts) {
    throw new Error(
      "ElevenLabs generation requires --allow-tts. Preview mode never calls TTS.",
    );
  }

  const key =
    process.env.ELEVENLABS_API_KEY;

  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is missing from .env.",
    );
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      voice,
    )}/with-timestamps?output_format=${encodeURIComponent(
      config.tts.outputFormat,
    )}`,
    {
      method: "POST",

      headers: {
        "xi-api-key": key,
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(request),

      signal:
        AbortSignal.timeout(120000),
    },
  );

  if (!response.ok) {
    const detail = (
      await response.text()
    )
      .split(key)
      .join("[REDACTED]")
      .slice(0, 1500);

    throw new Error(
      `ElevenLabs HTTP ${response.status}: ${detail}`,
    );
  }

  const result =
    responseSchema.parse(
      await response.json(),
    );

  await mkdir(directory, {
    recursive: true,
  });

  const bytes = Buffer.from(
    result.audio_base64,
    "base64",
  );

  const pendingFile =
    file + ".pending.mp3";

  await writeFile(
    pendingFile,
    bytes,
  );

  const duration =
    await audioDuration(
      pendingFile,
    );

  await rename(
    pendingFile,
    file,
  );

  await save(cacheFile, {
    hash: fingerprint,
    audioHash: hash(bytes),
    alignment:
      result.alignment,
  });

  return {
    file,
    duration,
    alignment:
      result.alignment,
    cached: false,
  };
}

/*
 * Align authored scenes against actual ElevenLabs speech.
 *
 * Fixed duration:
 *   narration must fit inside the authored duration.
 *
 * Auto duration:
 *   the authored plan is treated as the minimum duration.
 *   If real narration is longer, extend the render plan
 *   instead of speeding or rewriting speech.
 *
 * video-plan.json remains untouched.
 * main.ts writes this returned timing to render-plan.json.
 */
export function alignScenes(
  plan: VideoPlan,
  audio: {
    duration: number;
    alignment: Alignment | null;
  },
  options: AlignScenesOptions = {},
): VideoPlan {
  const durationMode =
    options.durationMode ?? "fixed";

  /*
   * Preserve old behavior for direct/legacy callers
   * that don't supply options.
   */
  const endingBufferSeconds =
    options.endingBufferSeconds ??
    0.15;

  if (
    !Number.isFinite(
      audio.duration,
    ) ||
    audio.duration <= 0
  ) {
    throw new Error(
      "Narration audio duration is invalid; cached audio preserved for review.",
    );
  }

  if (
    !Number.isFinite(
      endingBufferSeconds,
    ) ||
    endingBufferSeconds < 0
  ) {
    throw new Error(
      "Narration ending buffer must be a non-negative finite number.",
    );
  }

/*
 * Fixed duration remains strict.
 *
 * Reject an overlong narration before alignment inspection:
 * alignment cannot solve a duration overflow and speech
 * must never be accelerated merely to fit.
 */
if (
  durationMode === "fixed" &&
  audio.duration >
    plan.durationSeconds -
      endingBufferSeconds
) {
  throw new Error(
    `Narration is ${audio.duration.toFixed(
      2,
    )}s; must fit within ${(plan.durationSeconds - endingBufferSeconds).toFixed(
      2,
    )}s without speeding up. Cached audio preserved; shorten narration or explicitly increase the fixed duration.`,
  );
}

const alignment =
  audio.alignment;

if (
  !alignment ||
  alignment.characters.join("") !==
    plan.voiceover.text ||
  alignment.characters.length !==
    alignment
      .character_start_times_seconds
      .length ||
  alignment.characters.length !==
    alignment
      .character_end_times_seconds
      .length
) {
  throw new Error(
    "Missing or mismatched ElevenLabs alignment; cached audio preserved for review.",
  );
}

  /*
   * For auto-duration videos, real ElevenLabs timing
   * is authoritative once TTS exists.
   *
   * Never make an auto video shorter than the
   * planner-authored duration. We only expand.
   */
  const requiredFrames =
    Math.ceil(
      (audio.duration +
        endingBufferSeconds) *
        plan.fps,
    );

  const totalFrames =
    durationMode === "auto"
      ? Math.max(
          plan.totalFrames,
          requiredFrames,
        )
      : plan.totalFrames;

  const durationSeconds =
    totalFrames / plan.fps;

  /*
   * Locate each scene narration inside the complete
   * continuous narration string.
   *
   * This is safer than assuming every scene is always
   * separated by exactly one character in legacy plans.
   */
  let searchFrom = 0;

  const narrationOffsets =
    plan.scenes.map(
      (scene, index) => {
        if (!scene.voiceover) {
          return undefined;
        }

        const found =
          plan.voiceover.text.indexOf(
            scene.voiceover,
            searchFrom,
          );

        if (found < 0) {
          throw new Error(
            `Scene ${scene.id}: narration could not be located in the continuous ElevenLabs script.`,
          );
        }

        searchFrom =
          found +
          scene.voiceover.length;

        /*
         * The composition itself always begins at frame 0,
         * even if ElevenLabs has a tiny leading silence.
         */
        if (index === 0) {
          return 0;
        }

        return found;
      },
    );

  const starts =
    narrationOffsets.map(
      (
        characterOffset,
        index,
      ) => {
        if (
          characterOffset ===
          undefined
        ) {
          /*
           * Legacy empty-narration scenes keep their
           * authored start. Production OpenRouter plans
           * already require narration for every scene.
           */
          return Math.min(
            plan.scenes[index]
              .startFrame,
            totalFrames - 1,
          );
        }

        if (index === 0) {
          return 0;
        }

        const seconds =
          alignment
            .character_start_times_seconds[
            characterOffset
          ];

        if (
          !Number.isFinite(
            seconds,
          )
        ) {
          throw new Error(
            `Scene ${plan.scenes[index].id}: ElevenLabs alignment is missing the narration start time.`,
          );
        }

        const frame =
          Math.round(
            seconds *
              plan.fps,
          );

        if (
          frame < 0 ||
          frame >= totalFrames
        ) {
          throw new Error(
            `Scene ${plan.scenes[index].id}: aligned narration starts outside the render timeline.`,
          );
        }

        return frame;
      },
    );

  const scenes =
    plan.scenes.map(
      (scene, index) => {
        const startFrame =
          starts[index];

        const nextStart =
          starts[index + 1] ??
          totalFrames;

        return {
          ...scene,
          startFrame,

          durationInFrames:
            nextStart -
            startFrame,
        };
      },
    );

  /*
   * Keep at least one second per scene.
   *
   * If the narration allocation itself produces scenes
   * shorter than one second, that is a planning problem
   * rather than something we should hide by speeding or
   * overlapping content.
   */
  if (
    scenes.some(
      (scene) =>
        !Number.isFinite(
          scene.startFrame,
        ) ||
        !Number.isFinite(
          scene.durationInFrames,
        ) ||
        scene.startFrame < 0 ||
        scene.durationInFrames <
          plan.fps,
    )
  ) {
    throw new Error(
      "Aligned scenes are too short or out of order; review scene narration allocation.",
    );
  }

  /*
   * Explicitly verify contiguous timing before the
   * VideoPlan Zod validation runs in main.ts.
   */
  let expectedStart = 0;

  for (const scene of scenes) {
    if (
      scene.startFrame !==
      expectedStart
    ) {
      throw new Error(
        `Scene ${scene.id}: aligned scene timing is not contiguous.`,
      );
    }

    expectedStart +=
      scene.durationInFrames;
  }

  if (
    expectedStart !== totalFrames
  ) {
    throw new Error(
      "Aligned scene timing does not equal the final render duration.",
    );
  }

  return {
    ...plan,

    durationSeconds,

    totalFrames,

    scenes,
  };
}
import type { AutomationConfig } from "./types";
export function narrationBudget(
  text: string,
  durationSeconds: number,
  config: AutomationConfig,
) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const settings = config.narration;

  const pauseSecondsPerMinute =
    settings.pauseSecondsPerMinute ??
    (settings.pauseBufferSeconds ?? 2) * 2;

  const pauseBuffer =
    (durationSeconds / 60) * pauseSecondsPerMinute;

  const spokenSeconds =
    wordCount === 0
      ? 0
      : (wordCount / settings.wordsPerMinute) * 60;

  const estimatedSeconds = spokenSeconds + pauseBuffer;

  const availableSeconds =
    durationSeconds - settings.endingBufferSeconds;

  const usableSpeechSeconds = Math.max(
    0,
    availableSeconds - pauseBuffer,
  );

  const absoluteMaxWords = Math.max(
    0,
    Math.floor(
      (usableSpeechSeconds / 60) * settings.wordsPerMinute,
    ),
  );

  return {
    wordCount,
    estimatedSeconds,
    availableSeconds,

    fits:
      wordCount > 0 &&
      estimatedSeconds <= availableSeconds,

    targetWords: {
      min: Math.max(1, Math.floor(absoluteMaxWords * 0.8)),
      max: Math.max(1, Math.floor(absoluteMaxWords * 0.95)),
    },

    absoluteMaxWords,
  };
}
export function assertNarration(
  text: string,
  durationSeconds: number,
  config: AutomationConfig,
  mode: "auto" | "supplied" | "hybrid",
) {
  if (
    /```|~~~|^\s{0,3}#{1,6}\s|^\s*(?:import\s|from\s+\S+\s+import\s|docker (?:build|run)\s)|https?:\/\/|\]\(|^\s*\|.*\|/m.test(
      text,
    )
  )
    throw new Error(
      "Narration contains raw Markdown, code, commands or URLs. Generate dedicated spoken narration before TTS.",
    );
  const budget = narrationBudget(text, durationSeconds, config);
  if (!budget.fits)
    throw new NarrationBudgetError(
      `Pre-TTS narration budget exceeded: ${budget.wordCount} words, estimated ${budget.estimatedSeconds.toFixed(2)}s including pauses; available ${budget.availableSeconds.toFixed(2)}s after ending buffer. ${mode === "supplied" ? "Provide approved shorter supplied narration; it will not be silently rewritten." : "Shorten the generated narration while preserving the important facts."}`,
    );
  return budget;
}
export class NarrationBudgetError extends Error {}

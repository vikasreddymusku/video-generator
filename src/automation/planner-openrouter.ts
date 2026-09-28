import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { z } from "zod";
import type { Planner, PlannerInput, PlannerMetadata } from "./planner";
import { validatePlan } from "./planner";
import { hash, readJson, save } from "./io";
import { assertNarration, NarrationBudgetError } from "./narration";
import {
  buildPlannerMessages,
  plannerJsonSchema,
  PLANNER_PROMPT_VERSION,
  productionPlanSchema,
  type PlannerMessage,
} from "./planner-prompt";
import { readBoundedResponse } from "./source-loader";

const retryStatuses = new Set([429, 500, 502, 503, 504]);

const metadataSchema = z.object({
  plannerProvider: z.literal("openrouter"),
  plannerModel: z.string(),
  sourceHash: z.string(),
  planHash: z.string(),
  theme: z.string(),
  generatedAt: z.string(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});

const cacheSchema = z.object({
  fingerprint: z.string(),
  metadata: metadataSchema,
});

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().min(1),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),

  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

type Dependencies = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  apiKey?: () => string | undefined;
};

export class OpenRouterPlanner implements Planner {
  metadata?: PlannerMetadata;

  constructor(private readonly dependencies: Dependencies = {}) {}

  async createVideoPlan(input: PlannerInput) {
    this.metadata = undefined;

    const mode = input.content.metadata.voiceover_mode;
    const externalNarration =
      input.hybrid?.narrationSource === "USER_SCRIPT" ||
      input.hybrid?.narrationSource === "USER_AUDIO";
    const durationMode = input.content.metadata.duration_mode;

    /*
     * Supplied narration can only be checked before planning when the
     * requested duration is fixed.
     *
     * In auto-duration mode OpenRouter chooses a duration capable of
     * accommodating the approved supplied narration.
     */
    if (
      !externalNarration &&
      mode === "supplied" &&
      durationMode === "fixed" &&
      input.content.metadata.duration_seconds !== undefined
    ) {
      assertNarration(
        input.content.suppliedVoiceover,
        input.content.metadata.duration_seconds,
        input.config,
        mode,
      );
    }

    const messages = buildPlannerMessages(input);

    const fingerprint = hash(
      JSON.stringify({
        version: PLANNER_PROMPT_VERSION,
        sourceHash: input.content.sourceHash,
        theme: input.theme,
        themeId: input.themeId,
        planner: input.config.planner,
        video: input.config.video,
        render: input.config.render,
        narration: input.config.narration,
        messages,
      }),
    );

    const cacheFile = path.join(
      path.dirname(input.planFile),
      "planner-cache.json",
    );

    try {
      const cache = cacheSchema.parse(await readJson(cacheFile));

      if (cache.fingerprint === fingerprint) {
        const plan = validatePlan(
          input,
          productionPlanSchema.parse(await readJson(input.planFile)),
        );

        if (!externalNarration) {
          assertNarration(
            plan.voiceover.text,
            plan.durationSeconds,
            input.config,
            mode,
          );
        }

        if (cache.metadata.planHash === hash(JSON.stringify(plan))) {
          this.metadata = cache.metadata;
          return plan;
        }
      }
    } catch {
      /*
       * Missing, stale or invalid planner cache must never skip planning.
       */
    }

    const key = this.dependencies.apiKey
      ? this.dependencies.apiKey()
      : process.env.OPENROUTER_API_KEY;

    if (!key) {
      throw new Error(
        "OpenRouter selected but OPENROUTER_API_KEY is missing.",
      );
    }

    const knownSecrets = [
      key,
      process.env.ELEVENLABS_API_KEY,
    ].filter((value): value is string => Boolean(value));

    const redact = (message: string) =>
      knownSecrets.reduce(
        (value, secret) =>
          value.split(secret).join("[REDACTED]"),
        message,
      );

    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    let hasUsage = false;

    /*
     * One corrective planning pass is allowed.
     *
     * Auto/hybrid narration:
     *   - may shorten narration
     *   - may increase duration when duration mode is auto
     *
     * Supplied narration:
     *   - must never be rewritten
     *   - when duration mode is auto, duration may increase
     *
     * Fixed supplied narration:
     *   - cannot change narration
     *   - cannot change duration
     *   - therefore fails immediately if it does not fit
     */
    for (
      let editorialAttempt = 0;
      editorialAttempt < 2;
      editorialAttempt++
    ) {
      let raw: string;

      try {
        raw = await this.request(input, messages, key);
      } catch (error) {
        throw new Error(
          redact(
            error instanceof Error
              ? error.message
              : String(error),
          ),
        );
      }

      if (
        knownSecrets.some((secret) => raw.includes(secret))
      ) {
        throw new Error(
          "OpenRouter response contained a secret; response discarded without saving.",
        );
      }

      let envelope: z.infer<typeof responseSchema>;

      try {
        envelope = responseSchema.parse(JSON.parse(raw));
      } catch {
        throw new Error(
          "OpenRouter returned invalid response JSON or no text completion.",
        );
      }

      const choice = envelope.choices[0];

      if (
        choice.finish_reason &&
        choice.finish_reason !== "stop"
      ) {
        throw new Error(
          `OpenRouter completion did not finish normally (${choice.finish_reason}); no plan saved.`,
        );
      }

      if (envelope.usage) {
        hasUsage = true;

        usage.promptTokens +=
          envelope.usage.prompt_tokens ?? 0;

        usage.completionTokens +=
          envelope.usage.completion_tokens ?? 0;

        usage.totalTokens +=
          envelope.usage.total_tokens ?? 0;
      }

      let value: unknown;

      try {
        value = JSON.parse(choice.message.content);
      } catch {
        throw new Error(
          "OpenRouter plan is not a single JSON object (prose and Markdown fences are forbidden).",
        );
      }

      const parsed =
        productionPlanSchema.safeParse(value);

      if (!parsed.success) {
        throw new Error(
          `OpenRouter VideoPlan schema validation failed: ${parsed.error.issues
            .map(
              (issue) =>
                `${issue.path.join(".")}: ${issue.message}`,
            )
            .join("; ")}`,
        );
      }

      const plan = validatePlan(input, parsed.data);

      if (
        plan.compositionId === "DynamicVideo" ||
        plan.scenes.some(
          (scene) =>
            (!externalNarration && !scene.voiceover.trim()) ||
            scene.durationInFrames < plan.fps,
        )
      ) {
        throw new Error(
          "OpenRouter plan uses a reserved composition ID, empty narration, or scenes shorter than one second.",
        );
      }

      if (
        plan.voiceover.text.trim() ===
          input.content.body.trim() ||
        plan.voiceover.text.trim() ===
          input.content.raw.trim()
      ) {
        throw new Error(
          "OpenRouter returned source Markdown as narration; no TTS permitted.",
        );
      }

      try {
        if (!externalNarration) {
          assertNarration(
            plan.voiceover.text,
            plan.durationSeconds,
            input.config,
            mode,
          );
        }
      } catch (error) {
        const isBudgetError =
          error instanceof NarrationBudgetError;

        const canCorrect =
          isBudgetError &&
          editorialAttempt === 0 &&
          !(
            mode === "supplied" &&
            durationMode === "fixed"
          );

        if (canCorrect) {
          let durationInstruction: string;

          if (
            mode === "supplied" &&
            durationMode === "auto"
          ) {
            durationInstruction =
              "Narration mode is supplied and duration mode is auto. Preserve the supplied narration EXACTLY. Do not shorten, rewrite, paraphrase, or remove any supplied narration. Increase durationSeconds and totalFrames enough for the narration to fit naturally. Keep fps unchanged and rebuild contiguous scene timing to match the new totalFrames.";
          } else if (durationMode === "auto") {
            durationInstruction =
              "Duration mode is auto. You may increase durationSeconds and totalFrames if the content needs more natural speaking time, or shorten unnecessary narration while preserving all important source facts. Keep fps unchanged. Recalculate totalFrames as durationSeconds multiplied by fps and keep all scenes contiguous.";
          } else {
            durationInstruction =
              "Duration mode is fixed. Keep durationSeconds and totalFrames unchanged. Shorten the narration while preserving the important source facts.";
          }

          messages.push(
            {
              role: "assistant",
              content: choice.message.content,
            },
            {
              role: "user",
              content:
                `The plan is structurally valid but the narration does not fit naturally: ${
                  error instanceof Error
                    ? error.message
                    : String(error)
                } ` +
                `${durationInstruction} ` +
                "Preserve source facts, identity, theme, contact information, dimensions and fps. Return the complete corrected VideoPlan.",
            },
          );

          continue;
        }

        throw error;
      }

      this.metadata = {
        plannerProvider: "openrouter",
        plannerModel:
          input.config.planner.openrouterModel,
        sourceHash: plan.sourceHash,
        planHash: hash(JSON.stringify(plan)),
        theme: plan.theme,
        generatedAt: new Date().toISOString(),
        ...(hasUsage ? usage : {}),
      };

      await save(input.planFile, plan);

      await save(cacheFile, {
        fingerprint,
        metadata: this.metadata,
      });

      return plan;
    }

    throw new Error(
      "OpenRouter narration still does not fit naturally after one corrective planning pass.",
    );
  }

  private async request(
    input: PlannerInput,
    messages: PlannerMessage[],
    key: string,
  ): Promise<string> {
    const settings = input.config.planner;

    const send =
      this.dependencies.fetch ?? fetch;

    const sleep =
      this.dependencies.sleep ?? delay;

    for (
      let attempt = 0;
      attempt < settings.maxAttempts;
      attempt++
    ) {
      const signal = AbortSignal.timeout(
        settings.timeoutMs,
      );

      let response: Response;

      try {
        response = await send(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            redirect: "error",
            signal,

            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              model: settings.openrouterModel,

              /*
               * Do not send temperature here.
               *
               * It caused provider routing to reject the
               * GPT-5.6 Sol request when require_parameters
               * was enabled.
               */
              max_tokens:
                input.hybrid?.narrationSource === "USER_SCRIPT" ||
                input.hybrid?.narrationSource === "USER_AUDIO"
                  ? Math.min(settings.maxTokens, 4000)
                  : settings.maxTokens,

              stream: false,

              messages,

              provider: {
                require_parameters: true,
              },

              response_format:
                settings.structuredOutput
                  ? {
                      type: "json_schema",
                      json_schema: {
                        name: "VideoPlan",
                        strict: true,
                        schema:
                          plannerJsonSchema(),
                      },
                    }
                  : {
                      type: "json_object",
                    },
            }),
          },
        );
      } catch (error) {
        if (
          attempt + 1 <
          settings.maxAttempts
        ) {
          await sleep(
            500 * 2 ** attempt,
          );

          continue;
        }

        throw new Error(
          `OpenRouter network request failed after ${settings.maxAttempts} attempts: ${
            signal.aborted
              ? "timeout"
              : error instanceof Error
                ? error.message
                : "network error"
          }`,
        );
      }

      if (!response.ok) {
        if (
          retryStatuses.has(response.status) &&
          attempt + 1 <
            settings.maxAttempts
        ) {
          await response.body?.cancel();

          await sleep(
            500 * 2 ** attempt,
          );

          continue;
        }

        const detail = (
          await readBoundedResponse(
            response,
            65536,
          ).catch(
            () =>
              "No readable error body.",
          )
        ).slice(0, 1500);

        throw new Error(
          `OpenRouter HTTP ${response.status}: ${detail}`,
        );
      }

      try {
        return await readBoundedResponse(
          response,
          2 * 1024 * 1024,
        );
      } catch (error) {
        if (
          signal.aborted &&
          attempt + 1 <
            settings.maxAttempts
        ) {
          await sleep(
            500 * 2 ** attempt,
          );

          continue;
        }

        throw new Error(
          `OpenRouter response could not be read: ${
            signal.aborted
              ? "timeout"
              : error instanceof Error
                ? error.message
                : "read failure"
          }`,
        );
      }
    }

    throw new Error(
      "OpenRouter retry limit reached.",
    );
  }
}
import type { ContentInput } from "./load-content";
import type { AutomationConfig, ThemeConfig, VideoPlan, NarrationSource, VisualSource } from "./types";
import { videoPlanSchema } from "./types";
import { readJson } from "./io";
export type PlannerInput = {
  content: ContentInput;
  config: AutomationConfig;
  themeId: string;
  theme: ThemeConfig;
  planFile: string;
  hybrid?: {
    visualSource?: VisualSource;
    narrationSource?: NarrationSource;
  };
};
export interface Planner {
  createVideoPlan(input: PlannerInput): Promise<VideoPlan>;
  metadata?: PlannerMetadata;
}
export type PlannerMetadata = {
  plannerProvider: "openrouter";
  plannerModel: string;
  sourceHash: string;
  planHash: string;
  theme: string;
  generatedAt: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};
function normalizeEvidence(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sourceContains(
  source: string,
  evidence: string,
) {
  const normalizedEvidence =
    normalizeEvidence(evidence);

  if (!normalizedEvidence) return false;

  return normalizeEvidence(source).includes(
    normalizedEvidence,
  );
}
export function validatePlan(input: PlannerInput, value: unknown) {
  const plan = videoPlanSchema.parse(value);
  const meta = input.content.metadata;

  const [width, height] = meta.resolution
    ? meta.resolution.split("x").map(Number)
    : [input.config.render.width, input.config.render.height];

  if (plan.sourceHash !== input.content.sourceHash) {
    throw new Error(
      "Source changed. Regenerate video-plan.json before continuing.",
    );
  }

  if (
    plan.slug !== meta.slug ||
    plan.title !== meta.title ||
    plan.brand !== meta.brand ||
    plan.theme !== input.themeId ||
    plan.fps !== (meta.fps ?? input.config.render.fps) ||
    plan.width !== width ||
    plan.height !== height
  ) {
    throw new Error(
      "Plan metadata does not match source/config/theme. Regenerate the plan.",
    );
  }

  // Duration is enforced only when explicitly fixed.
  if (
    meta.duration_mode === "fixed" &&
    plan.durationSeconds !== meta.duration_seconds
  ) {
    throw new Error(
      `Plan duration must be exactly ${meta.duration_seconds} seconds because duration mode is fixed.`,
    );
  }

  if (
    !plan.narrationExternal &&
    input.content.metadata.voiceover_mode === "supplied" &&
    plan.voiceover.text !== input.content.suppliedVoiceover
  ) {
    throw new Error(
      "Plan must preserve the approved continuous narration.",
    );
  }

  for (
    const key of Object.keys(
      plan.contact,
    ) as (keyof VideoPlan["contact"])[]
  ) {
    if (plan.contact[key] !== meta[key]) {
      throw new Error(`Plan contact mismatch: ${key}`);
    }
  }
  const source = input.content.body;

for (const scene of plan.scenes) {
  if (scene.type === "code" && scene.code) {
    if (
      !sourceContains(
        source,
        scene.code.sourceEvidence,
      )
    ) {
      throw new Error(
        `Code scene ${scene.id} uses unsupported source evidence.`,
      );
    }

    if (!sourceContains(source, scene.code.code)) {
      throw new Error(
        `Code scene ${scene.id} contains code that was not found in the source Markdown.`,
      );
    }
  }

  if (
    scene.type === "diagram" &&
    scene.diagram
  ) {
    for (
      const evidence of
      scene.diagram.sourceEvidence
    ) {
      if (!sourceContains(source, evidence)) {
        throw new Error(
          `Diagram scene ${scene.id} uses unsupported source evidence.`,
        );
      }
    }
  }

  if (
    scene.type === "metrics" &&
    scene.metrics
  ) {
    for (const metric of scene.metrics.metrics) {
      if (
        !sourceContains(
          source,
          metric.sourceEvidence,
        )
      ) {
        throw new Error(
          `Metric "${metric.label}" in scene ${scene.id} is not supported by the source.`,
        );
      }

      if (
        !normalizeEvidence(
          metric.sourceEvidence,
        ).includes(
          normalizeEvidence(metric.value),
        )
      ) {
        throw new Error(
          `Metric "${metric.label}" value is not present in its source evidence.`,
        );
      }
    }
  }
}

  return plan;
}
export class CodexTestPlanner implements Planner {
  async createVideoPlan(input: PlannerInput) {
    let value: unknown;
    try {
      value = await readJson(input.planFile);
    } catch {
      throw new Error(
        `Codex planning required: create ${input.planFile} from the complete source using VideoPlan schema. No API is called.`,
      );
    }
    return validatePlan(input, value);
  }
}

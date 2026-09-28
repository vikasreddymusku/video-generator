import { z } from "zod";

const text = z.string().min(1);
const positive = z.number().finite().positive();
const publicBrandAsset = z
  .string()
  .regex(/^branding\/[a-z0-9-]+\.(?:mp4|webm|png|jpe?g|webp)$/i);
export const brandingModeSchema = z.enum(["dynamic", "uploaded", "none"]);
export const brandingAnimationSchema = z.enum(["enter-scale", "fade-up", "fade"]);
export const brandingConfigSchema = z.object({
  logoAsset: publicBrandAsset.optional(),
  intro: z.object({
    enabled: z.boolean().default(true),
    mode: brandingModeSchema.default("dynamic"),
    asset: publicBrandAsset.optional(),
    durationSeconds: positive.max(30).default(4),
    logo: z.object({ enabled: z.boolean().default(true), durationSeconds: positive.max(15).default(1), animation: brandingAnimationSchema.default("enter-scale") }).default({ enabled: true, durationSeconds: 1, animation: "enter-scale" }),
    brandName: z.object({ enabled: z.boolean().default(true), durationSeconds: positive.max(15).default(1), animation: brandingAnimationSchema.default("fade-up") }).default({ enabled: true, durationSeconds: 1, animation: "fade-up" }),
    tagline: z.object({ enabled: z.boolean().default(true), durationSeconds: positive.max(15).default(1), animation: brandingAnimationSchema.default("fade") }).default({ enabled: true, durationSeconds: 1, animation: "fade" }),
    holdDurationSeconds: z.number().finite().nonnegative().max(15).default(1),
  }).default({ enabled: true, mode: "dynamic", durationSeconds: 4, logo: { enabled: true, durationSeconds: 1, animation: "enter-scale" }, brandName: { enabled: true, durationSeconds: 1, animation: "fade-up" }, tagline: { enabled: true, durationSeconds: 1, animation: "fade" }, holdDurationSeconds: 1 }),
  outro: z.object({
    enabled: z.boolean().default(true),
    mode: brandingModeSchema.default("dynamic"),
    asset: publicBrandAsset.optional(),
    durationSeconds: positive.max(30).default(5),
    showVideoTitle: z.boolean().default(true),
    showWebsite: z.boolean().default(true),
    showEmail: z.boolean().default(true),
    showPhone: z.boolean().default(true),
    showAddress: z.boolean().default(true),
    showTagline: z.boolean().default(true),
    showQrCode: z.boolean().default(false),
    qrDestination: z.string().url().startsWith("https://").optional(),
    qrSize: positive.max(600).default(190),
    qrLabel: z.string().trim().min(1).max(80).default("Scan to enroll"),
    qrPosition: z.enum(["left", "right"]).default("right"),
  }).default({ enabled: true, mode: "dynamic", durationSeconds: 5, showVideoTitle: true, showWebsite: true, showEmail: true, showPhone: true, showAddress: true, showTagline: true, showQrCode: false, qrSize: 190, qrLabel: "Scan to enroll", qrPosition: "right" }),
}).default({
  intro: { enabled: true, mode: "dynamic", durationSeconds: 4, logo: { enabled: true, durationSeconds: 1, animation: "enter-scale" }, brandName: { enabled: true, durationSeconds: 1, animation: "fade-up" }, tagline: { enabled: true, durationSeconds: 1, animation: "fade" }, holdDurationSeconds: 1 },
  outro: { enabled: true, mode: "dynamic", durationSeconds: 5, showVideoTitle: true, showWebsite: true, showEmail: true, showPhone: true, showAddress: true, showTagline: true, showQrCode: false, qrSize: 190, qrLabel: "Scan to enroll", qrPosition: "right" },
});
export type BrandingConfig = z.infer<typeof brandingConfigSchema>;
export const brandingOverrideSchema = z.object({
  intro: z.object({ mode: brandingModeSchema.optional(), asset: publicBrandAsset.optional() }).strict().optional(),
  outro: z.object({ mode: brandingModeSchema.optional(), asset: publicBrandAsset.optional() }).strict().optional(),
}).strict();
export type BrandingOverride = z.infer<typeof brandingOverrideSchema>;
export const themeSchema = z.object({
  name: text,
  background: text,
  surface: text,
  primary: text,
  secondary: text,
  text,
  muted: text,
  fontFamily: text,
  headingWeight: positive,
  borderRadius: z.number().nonnegative(),
  glowIntensity: z.number().min(0).max(1),
  particleDensity: z.enum(["low", "medium", "high"]),
  hudDensity: z.enum(["low", "medium", "high"]),
  cardStyle: text,
  transitionFamily: text,
  transitionFrames: positive.int(),
  ctaStyle: text,
  musicStyle: text,
  sfxStyle: text,
});
export type ThemeConfig = z.infer<typeof themeSchema>;
export const themeCatalogSchema = z.object({
  active: z.string().optional(),
  themes: z.record(z.string(), themeSchema),
});
export type ThemeCatalog = z.infer<typeof themeCatalogSchema>;
export const configSchema = z.object({
  brand: z
    .object({
      name: text,
      cta: text,
      website: text,
      email: z.email(),
      phone: text,
      address: text,
      tagline: text,
    })
    .partial()
    .optional(),
  branding: brandingConfigSchema,
  video: z
  .object({
    durationMode: z.enum(["auto", "fixed"]).default("auto"),
    durationSeconds: positive.optional(),
    videoType: text.default("course-promo"),
    theme: text.optional(),
    voiceoverMode: z.enum(["auto", "supplied", "hybrid"]).default("auto"),
  })
  .superRefine((video, ctx) => {
    if (video.durationMode === "fixed" && video.durationSeconds === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "durationSeconds is required when durationMode=fixed",
      });
    }
  })
  .default({
    durationMode: "auto",
    videoType: "course-promo",
    voiceoverMode: "auto",
  }),

  planner: z.object({
    mode: z.enum(["codex-test", "openrouter"]),
    openrouterModel: text,
    temperature: z.number().min(0).max(2),
    structuredOutput: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(3).default(3),
    timeoutMs: positive.int().max(120000).default(60000),
    maxTokens: positive.int().default(6000),
  }),
  narration: z
  .object({
    wordsPerMinute: positive.max(220).default(150),

    // Dynamic pause allowance instead of assuming a 30-second video.
    pauseSecondsPerMinute: z.number().nonnegative().default(4),

    // Kept temporarily so older config files still parse.
    pauseBufferSeconds: z.number().nonnegative().optional(),

    endingBufferSeconds: z.number().min(0.15).default(0.5),
  })
  .default({
    wordsPerMinute: 150,
    pauseSecondsPerMinute: 4,
    endingBufferSeconds: 0.5,
  }),
  tts: z.object({
    provider: z.literal("elevenlabs"),
    enabled: z.boolean(),
    modelId: text,
    voiceIdEnv: z.literal("ELEVENLABS_VOICE_ID"),
    voiceId: text.optional(),
    outputFormat: z.string().regex(/^mp3_/),
    voiceSettings: z
      .record(z.string(), z.union([z.number(), z.boolean()]))
      .optional(),
  }),
  render: z.object({
    fps: positive,
    width: positive.int(),
    height: positive.int(),
    codec: z.literal("h264"),
    outputDir: text,
  }),
  audio: z.object({
    voiceVolume: z.number().min(0).max(1),
    musicVolume: z.number().min(0).max(1),
    sfxVolume: z.number().min(0).max(1),
  }),
  validation: z.object({
    enabled: z.boolean(),
    durationToleranceSeconds: z.number().nonnegative(),
  }),
});
export type AutomationConfig = z.infer<typeof configSchema>;
export const sceneTypes = [
  "brand-intro",
  "brand-outro",
  "hero-title",
  "process-flow",
  "feature-grid",
  "technology-stack",
  "project-showcase",
  "code",
  "diagram",
  "metrics",
  "cta",
] as const;

export const codeSceneDataSchema = z.object({
  language: text,
  filename: z.string(),
  code: text,
  highlightLines: z.array(z.number().int().positive()).max(20),
  mode: z.enum(["editor", "terminal", "diff"]),
  sourceEvidence: text,
});

export const diagramNodeSchema = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  label: text,
  detail: z.string(),
  group: z.string(),
});

export const diagramEdgeSchema = z.object({
  from: text,
  to: text,
  label: z.string(),
});

export const diagramSceneDataSchema = z.object({
  direction: z.enum(["left-to-right", "top-to-bottom"]),
  activeNodeId: z.string(),
  nodes: z.array(diagramNodeSchema).min(1).max(8),
  edges: z.array(diagramEdgeSchema).max(12),
  sourceEvidence: z.array(text).min(1).max(10),
});

export const metricItemSchema = z.object({
  label: text,
  value: text,
  unit: z.string(),
  context: z.string(),
  sourceEvidence: text,
});

export const metricsSceneDataSchema = z.object({
  layout: z.enum(["cards", "comparison", "progress"]),
  metrics: z.array(metricItemSchema).min(1).max(6),
});

export const sceneSchema = z.object({
  id: text,

  type: z.enum(sceneTypes),

  startFrame: z.number().int().nonnegative(),

  durationInFrames: positive.int(),

  headline: text,

  supportingText: z.array(text),

  items: z
    .array(
      z.object({
        label: text,
        detail: z.string().optional(),
      }),
    )
    .max(8),

  visualConcept: text,

  animationDirection: z.enum([
    "up",
    "left",
    "right",
    "scale",
  ]),

  voiceover: z.string(),

  // This is VideoPlan data, not a runtime CSS transition.
// eslint-disable-next-line @remotion/non-pure-animation
transition: z.enum([
  "light-sweep",
  "glow-wipe",
  "directional-wipe",
  "bloom",
  "fade",
  "zoom-through",
]),

  suggestedSfx: z.array(
    z.enum(["whoosh", "click", "impact"]),
  ),

  /*
   * Technical scene payloads.
   *
   * These deliberately default to null so old Phase-1 and
   * Phase-2 VideoPlans remain readable.
   *
   * OpenRouter must explicitly return all three properties
   * because strict JSON-schema mode marks every property
   * required. Unused payloads must therefore be null.
   */
  code: codeSceneDataSchema.nullable().default(null),

  diagram: diagramSceneDataSchema.nullable().default(null),

  metrics: metricsSceneDataSchema.nullable().default(null),
});

export type CodeSceneData =
  z.infer<typeof codeSceneDataSchema>;

export type DiagramSceneData =
  z.infer<typeof diagramSceneDataSchema>;

export type MetricsSceneData =
  z.infer<typeof metricsSceneDataSchema>;


export type VideoScene = z.infer<typeof sceneSchema>;
export const videoPlanSchema = z
  .object({
    version: z.literal(1),
    compositionId: z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: text,
    brand: text,
    sourceHash: text,
    durationSeconds: positive,
    fps: positive,
    width: positive.int(),
    height: positive.int(),
    totalFrames: positive.int(),
    theme: text,
    voiceover: z.object({ mode: z.literal("continuous"), text: z.string() }),
    // True only when narration is supplied externally and therefore is not required
    // to be generated or concatenated by the visual planner.
    narrationExternal: z.boolean().default(false),
    // Optional only for compatibility with already-rendered Phase 1 plans.
    fullVoiceover: z.string().optional(),
    contact: z.object({
      cta: text,
      website: text,
      email: text,
      phone: text,
      address: text,
      tagline: text,
    }),
    scenes: z.array(sceneSchema).min(1).max(30),
  })
  .superRefine((plan, ctx) => {
    if (
      plan.fullVoiceover !== undefined &&
      plan.fullVoiceover !== plan.voiceover.text
    )
      ctx.addIssue({
        code: "custom",
        message: "fullVoiceover must equal voiceover.text",
      });
    if (!plan.narrationExternal && !plan.voiceover.text.trim())
      ctx.addIssue({
        code: "custom",
        message: "AI-generated narration cannot be empty",
      });
    let end = 0;
    const ids = new Set<string>();
    for (const scene of plan.scenes) {
      if (scene.type === "code" && scene.code === null) {
  ctx.addIssue({
    code: "custom",
    message: `Scene ${scene.id}: code scene requires code payload`,
  });
}

if (scene.type !== "code" && scene.code !== null) {
  ctx.addIssue({
    code: "custom",
    message: `Scene ${scene.id}: non-code scene cannot contain code payload`,
  });
}

if (
  scene.type === "diagram" &&
  scene.diagram === null
) {
  ctx.addIssue({
    code: "custom",
    message: `Scene ${scene.id}: diagram scene requires diagram payload`,
  });
}

if (
  scene.type !== "diagram" &&
  scene.diagram !== null
) {
  ctx.addIssue({
    code: "custom",
    message: `Scene ${scene.id}: non-diagram scene cannot contain diagram payload`,
  });
}

if (
  scene.type === "metrics" &&
  scene.metrics === null
) {
  ctx.addIssue({
    code: "custom",
    message: `Scene ${scene.id}: metrics scene requires metrics payload`,
  });
}

if (
  scene.type !== "metrics" &&
  scene.metrics !== null
) {
  ctx.addIssue({
    code: "custom",
    message: `Scene ${scene.id}: non-metrics scene cannot contain metrics payload`,
  });
}

if (scene.code) {
  const lineCount = scene.code.code.split("\n").length;

  for (const line of scene.code.highlightLines) {
    if (line > lineCount) {
      ctx.addIssue({
        code: "custom",
        message: `Scene ${scene.id}: highlighted code line ${line} exceeds code length`,
      });
    }
  }
}

if (scene.diagram) {
  const nodeIds = new Set(
    scene.diagram.nodes.map((node) => node.id),
  );

  for (const edge of scene.diagram.edges) {
    if (
      !nodeIds.has(edge.from) ||
      !nodeIds.has(edge.to)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Scene ${scene.id}: diagram edge references an unknown node`,
      });
    }
  }

  if (
    scene.diagram.activeNodeId &&
    !nodeIds.has(scene.diagram.activeNodeId)
  ) {
    ctx.addIssue({
      code: "custom",
      message: `Scene ${scene.id}: activeNodeId does not exist`,
    });
  }
}
      if (scene.startFrame !== end || ids.has(scene.id))
        ctx.addIssue({
          code: "custom",
          message: `Scene ${scene.id}: duplicate ID or non-contiguous timing`,
        });
      ids.add(scene.id);
      end += scene.durationInFrames;
    }
    if (
      end !== plan.totalFrames ||
      Math.abs(plan.durationSeconds * plan.fps - end) > 0.001
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Scene frames must equal durationSeconds * fps and totalFrames",
      });
    if (
      !plan.narrationExternal &&
      plan.scenes
        .map((s) => s.voiceover)
        .filter(Boolean)
        .join(" ") !== plan.voiceover.text
    )
      ctx.addIssue({
        code: "custom",
        message: "Scene narration must concatenate to the continuous script",
      });
  });
export type VideoPlan = z.infer<typeof videoPlanSchema>;
export type QueueItem = {
  source: string;
  line: number;
  original: string;
  done: boolean;
};
export type ValidationResult = {
  valid: boolean;
  checks: Record<string, boolean>;
  errors: string[];
};
export type AudioAssets = {
  voiceover?: string;
  music?: string;
  sfx: Partial<Record<"whoosh" | "click" | "impact", string>>;
};
export type VideoProps = {
  plan: VideoPlan;
  theme: ThemeConfig;
  audio: AudioAssets;
  mix: AutomationConfig["audio"];
  branding?: ResolvedBranding;
  hybrid?: HybridInputs;
};

export type VisualSource = "AI" | "USER_VIDEO";
export type NarrationSource = "AI_SCRIPT" | "USER_SCRIPT" | "USER_AUDIO";

export type HybridInputs = {
  visualSource?: VisualSource;
  narrationSource?: NarrationSource;
  userVideoFile?: string;
  userNarrationAudioFile?: string;
  userNarrationScript?: string;
  userVideoDurationSeconds?: number;
};

export type ResolvedBranding = {
  brandName: string;
  tagline: string;
  cta: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  videoTitle: string;
  intro: BrandingConfig["intro"] & { frames: number };
  outro: BrandingConfig["outro"] & { frames: number; qrEnabled: boolean; qrAsset?: string };
  logoAsset?: string;
};

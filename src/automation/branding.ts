import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import type { AutomationConfig, BrandingOverride, ResolvedBranding, VideoPlan } from "./types";

const frames = (seconds: number, fps: number) => Math.round(seconds * fps);
const normalizePublicAsset = (asset?: string) => {
  if (!asset) return undefined;
  return asset
    .replace(/^\/+/, "")
    .replace(/^public\//i, "");
};
const globalBrandSceneDefaults = {
  supportingText: [],
  items: [],
  voiceover: "",
  // This is static VideoPlan metadata, not a browser-side animation.
  // eslint-disable-next-line @remotion/non-pure-animation
  transition: "fade" as const,
  suggestedSfx: [],
  code: null,
  diagram: null,
  metrics: null,
} satisfies Pick<
  VideoPlan["scenes"][number],
  | "supportingText"
  | "items"
  | "voiceover"
  | "transition"
  | "suggestedSfx"
  | "code"
  | "diagram"
  | "metrics"
>;
export function resolveBranding(
  config: AutomationConfig,
  videoTitle: string,
  fps: number,
  override: BrandingOverride = {},
): ResolvedBranding {
  const base = config.branding;
  const intro = {
  ...base.intro,
  ...override.intro,
  asset: normalizePublicAsset(
    override.intro?.asset ?? base.intro.asset,
  ),
};

const outro = {
  ...base.outro,
  ...override.outro,
  asset: normalizePublicAsset(
    override.outro?.asset ?? base.outro.asset,
  ),
};
  // A job override can select the shared uploaded slot. If no validated asset
  // exists, keep the job renderable with the configured dynamic treatment.
  if (intro.mode === "uploaded" && !intro.asset) intro.mode = "dynamic";
  if (outro.mode === "uploaded" && !outro.asset) outro.mode = "dynamic";
  const identity = config.brand;
  if (!identity?.name || !identity.tagline || !identity.cta || !identity.website || !identity.email || !identity.phone || !identity.address)
    throw new Error("Global branding requires complete brand identity in automation.config.json.");
  const introActive = intro.enabled && intro.mode !== "none";
  const outroActive = outro.enabled && outro.mode !== "none";
  const qrEnabled =
  outroActive &&
  outro.mode === "dynamic" &&
  outro.showQrCode === true &&
  typeof outro.qrDestination === "string" &&
  /^https:\/\//i.test(outro.qrDestination);
  return {
    brandName: identity.name,
    tagline: identity.tagline,
    cta: identity.cta,
    website: identity.website,
    email: identity.email,
    phone: identity.phone,
    address: identity.address,
    videoTitle,
    logoAsset: base.logoAsset,
    intro: { ...intro, enabled: introActive, frames: introActive ? frames(intro.durationSeconds, fps) : 0 },
    outro: { ...outro, enabled: outroActive, qrEnabled, frames: outroActive ? frames(outro.durationSeconds, fps) : 0 },
  };
}

export async function prepareBrandingAssets(root: string, branding: ResolvedBranding): Promise<ResolvedBranding> {
  if (!branding.outro.qrEnabled || !branding.outro.qrDestination) return branding;
  const id = createHash("sha256").update(branding.outro.qrDestination).digest("hex").slice(0, 24);
  const relative = `branding/qr-${id}.svg`;
  const file = path.join(root, "public", relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await QRCode.toString(branding.outro.qrDestination, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
  return { ...branding, outro: { ...branding.outro, qrAsset: relative } };
}

export function brandingFrames(branding: ResolvedBranding) {
  return branding.intro.frames + branding.outro.frames;
}

export function applyBrandingTiming(plan: VideoPlan, branding: ResolvedBranding): VideoPlan {
  const introFrames = branding.intro.frames;
  const outroFrames = branding.outro.frames;
  if (!introFrames && !outroFrames) return plan;
  const scenes: VideoPlan["scenes"] = [
    ...(introFrames
      ? [
          {
            ...globalBrandSceneDefaults,
            id: "global-brand-intro",
            type: "brand-intro" as const,
            startFrame: 0,
            durationInFrames: introFrames,
            headline: branding.videoTitle,
            visualConcept: "Global branding intro",
            animationDirection: "scale" as const,
          },
        ]
      : []),
    ...plan.scenes.map(scene => ({ ...scene, startFrame: scene.startFrame + introFrames })),
    ...(outroFrames
      ? [
          {
            ...globalBrandSceneDefaults,
            id: "global-brand-outro",
            type: "brand-outro" as const,
            startFrame: introFrames + plan.totalFrames,
            durationInFrames: outroFrames,
            headline: branding.videoTitle,
            visualConcept: "Global branding outro",
            animationDirection: "up" as const,
          },
        ]
      : []),
  ];
  const totalFrames = plan.totalFrames + introFrames + outroFrames;
  return { ...plan, totalFrames, durationSeconds: totalFrames / plan.fps, scenes };
}

export function stripBrandingTiming(plan: VideoPlan, branding: ResolvedBranding) {
  const hasBrandingTiming = plan.scenes.some(
    scene => scene.id === "global-brand-intro" || scene.id === "global-brand-outro",
  );
  if (!hasBrandingTiming) return plan;
  const introFrames = branding.intro.frames;
  const outroFrames = branding.outro.frames;
  const scenes = plan.scenes
    .filter(scene => scene.id !== "global-brand-intro" && scene.id !== "global-brand-outro")
    .map(scene => ({ ...scene, startFrame: scene.startFrame - introFrames }));
  const totalFrames = plan.totalFrames - introFrames - outroFrames;
  return { ...plan, totalFrames, durationSeconds: totalFrames / plan.fps, scenes };
}

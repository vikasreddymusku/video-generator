import { Video } from "@remotion/media";
import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ResolvedBranding } from "../automation/types";
import type { SceneProps } from "./shared";

type IntroDisplay = Pick<
  ResolvedBranding,
  "brandName" | "tagline" | "videoTitle" | "logoAsset" | "intro"
>;

const fallbackIntro = (
  scene: SceneProps["scene"],
  plan: SceneProps["plan"],
  fps: number,
): IntroDisplay => ({
  brandName: scene.headline,
  tagline: plan.contact.tagline,
  videoTitle: "",
  logoAsset: undefined,
  intro: {
    enabled: true,
    mode: "dynamic",
    durationSeconds: scene.durationInFrames / fps,
    frames: scene.durationInFrames,
    logo: { enabled: true, durationSeconds: 1, animation: "enter-scale" },
    brandName: { enabled: true, durationSeconds: 1, animation: "fade-up" },
    tagline: { enabled: true, durationSeconds: 1, animation: "fade" },
    holdDurationSeconds: 1,
  },
});

const entrance = (
  frame: number,
  start: number,
  duration: number,
  kind: "enter-scale" | "fade-up" | "fade",
  enabled: boolean,
) => {
  if (!enabled) return { opacity: 0, transform: "none" };
  const end = start + Math.max(1, duration * 0.65);
  const progress = interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  if (kind === "enter-scale")
    return {
      opacity: progress,
      transform: `scale(${interpolate(progress, [0, 1], [0.72, 1])})`,
    };
  if (kind === "fade-up")
    return {
      opacity: progress,
      transform: `translateY(${interpolate(progress, [0, 1], [28, 0])}px)`,
    };
  return { opacity: progress, transform: "none" };
};

export const BrandIntroScene = ({ scene, theme, plan, branding }: SceneProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b: IntroDisplay = branding ?? fallbackIntro(scene, plan, fps);
  if (!b.intro.enabled || b.intro.mode === "none") return null;
  if (b.intro.mode === "uploaded" && b.intro.asset)
    return (
      <Video
        src={staticFile(b.intro.asset)}
        muted
        objectFit="cover"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
    );
  const logoFrames = b.intro.logo.durationSeconds * fps;
  const nameStart = logoFrames;
  const taglineStart = nameStart + b.intro.brandName.durationSeconds * fps;
  const logo = entrance(
    frame,
    0,
    logoFrames,
    b.intro.logo.animation,
    b.intro.logo.enabled,
  );
  const name = entrance(
    frame,
    nameStart,
    b.intro.brandName.durationSeconds * fps,
    b.intro.brandName.animation,
    b.intro.brandName.enabled,
  );
  const tagline = entrance(
    frame,
    taglineStart,
    b.intro.tagline.durationSeconds * fps,
    b.intro.tagline.animation,
    b.intro.tagline.enabled,
  );
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 35,
      }}
    >
      {b.intro.logo.enabled &&
        (b.logoAsset ? (
          <Img
            src={staticFile(b.logoAsset)}
            alt=""
            style={{ width: 135, height: 135, objectFit: "contain", ...logo }}
          />
        ) : (
          <svg
            aria-hidden="true"
            width="130"
            height="130"
            viewBox="0 0 100 100"
            style={logo}
          >
            <path d="M15 20 H65 L90 50 65 80 H15 L40 50Z" fill={theme.primary} />
          </svg>
        ))}
      {b.intro.brandName.enabled && (
        <div
          style={{
            ...name,
            color: theme.text,
            fontSize: 84,
            fontWeight: 900,
            letterSpacing: 3,
            textAlign: "center",
          }}
        >
          {b.brandName.toUpperCase()}
        </div>
      )}
      {b.intro.tagline.enabled && (
        <div
          style={{
            ...tagline,
            color: theme.secondary,
            fontSize: 25,
            letterSpacing: 6,
            textAlign: "center",
          }}
        >
          {b.tagline}
        </div>
      )}
      {b.videoTitle && (
        <div
          style={{
            position: "absolute",
            bottom: 92,
            opacity: interpolate(
              frame,
              [Math.max(0, b.intro.frames - fps * 0.6), b.intro.frames],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
            fontSize: 35,
            color: theme.muted,
            letterSpacing: 2,
          }}
        >
          {b.videoTitle.toUpperCase()}
        </div>
      )}
    </div>
  );
};

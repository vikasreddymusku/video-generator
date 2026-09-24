import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig, VideoScene } from "../automation/types";
export const SceneTransition = ({
  style,
  theme,
}: {
  style: VideoScene["transition"];
  theme: ThemeConfig;
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, theme.transitionFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  if (p >= 1) return null;
  if (style === "fade")
    return (
      <AbsoluteFill style={{ background: theme.background, opacity: 1 - p }} />
    );
  if (style === "bloom")
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle, ${theme.primary}, transparent 70%)`,
          opacity: 1 - p,
          scale: 1 + p * 2,
        }}
      />
    );
  if (style === "zoom-through")
    return (
      <AbsoluteFill
        style={{
          border: `${80 * (1 - p)}px solid ${theme.primary}`,
          scale: 1 + p,
          opacity: 1 - p,
        }}
      />
    );
  return (
    <AbsoluteFill
      style={{
        background:
          style === "directional-wipe"
            ? theme.background
            : `linear-gradient(90deg, transparent, ${theme.primary}, transparent)`,
        width: style === "light-sweep" ? "30%" : "110%",
        translate: `${p * 240 - 120}% 0`,
        opacity: 1 - p * 0.8,
        filter: style === "glow-wipe" ? "blur(24px)" : undefined,
      }}
    />
  );
};

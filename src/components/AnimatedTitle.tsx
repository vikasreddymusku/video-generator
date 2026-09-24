import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoScene } from "../automation/types";
export const AnimatedTitle = ({
  text,
  size = 106,
  direction = "up",
}: {
  text: string;
  size?: number;
  direction?: VideoScene["animationDirection"];
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.02,
        letterSpacing: "-0.045em",
        whiteSpace: "pre-line",
        opacity: interpolate(frame, [0, 12], [0, 1], {
          extrapolateRight: "clamp",
        }),
        translate:
          direction === "left"
            ? `${(1 - p) * -90}px 0`
            : direction === "right"
              ? `${(1 - p) * 90}px 0`
              : `0 ${(1 - p) * 70}px`,
        scale: direction === "scale" ? 0.85 + p * 0.15 : 1,
      }}
    >
      {text}
    </div>
  );
};

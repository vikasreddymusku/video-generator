import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../automation/types";
export const NetworkBackground = ({
  theme,
  quiet = false,
}: {
  theme: ThemeConfig;
  quiet?: boolean;
}) => {
  const frame = useCurrentFrame();
  const count = quiet
    ? 10
    : { low: 18, medium: 32, high: 48 }[theme.particleDensity];
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse at 80% 40%, ${theme.primary}18, transparent 60%)`,
      }}
    >
      <svg width="1920" height="1080" style={{ opacity: quiet ? 0.12 : 0.35 }}>
        {Array.from({ length: count }, (_, i) => {
          const x = (i * 317 + 90) % 1920;
          const y = (i * 173 + frame * 0.2) % 1080;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={2 + (i % 3)} fill={theme.primary} />
              {i % 3 === 0 && (
                <line
                  x1={x}
                  y1={y}
                  x2={(x + 270) % 1920}
                  y2={(y + 180) % 1080}
                  stroke={theme.primary}
                  opacity={0.2}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          right: 130,
          top: 100,
          width: 700,
          height: 700,
          border: `1px solid ${theme.primary}20`,
          borderRadius: "50%",
          rotate: `${frame * 0.08}deg`,
          opacity: quiet ? 0.2 : 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 65,
            border: `2px dashed ${theme.primary}20`,
            borderRadius: "50%",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

import { interpolate, useCurrentFrame } from "remotion";
import { Heading, type SceneProps } from "./shared";
export const ProcessFlowScene = (props: SceneProps) => {
  const f = useCurrentFrame();
  const { scene, theme } = props;
  return (
    <>
      <Heading {...props} />
      <div style={{ display: "flex", alignItems: "center", marginTop: 150 }}>
        {scene.items.map((item, i) => (
          <div
            key={item.label}
            style={{
              flex: 1,
              position: "relative",
              opacity: interpolate(f - i * 12, [0, 15], [0.25, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {i < scene.items.length - 1 && (
              <div
                style={{
                  height: 3,
                  background: theme.primary,
                  position: "absolute",
                  top: 60,
                  width: "100%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${(((f + i * 9) % 36) / 36) * 100}%`,
                    top: -4,
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: theme.secondary,
                    boxShadow: `0 0 20px ${theme.primary}`,
                  }}
                />
              </div>
            )}
            <div
              style={{
                width: 120,
                height: 120,
                border: `2px solid ${theme.primary}`,
                background: theme.background,
                borderRadius: 30,
                position: "relative",
                display: "grid",
                placeItems: "center",
                fontSize: 42,
                color: theme.secondary,
                boxShadow: `0 0 ${f > i * 12 ? 30 : 0}px ${theme.primary}35`,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 30 }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 32, color: theme.muted, marginTop: 80 }}>
        {scene.supportingText[1]}
      </div>
    </>
  );
};

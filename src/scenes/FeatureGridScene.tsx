import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Heading, type SceneProps } from "./shared";
export const FeatureGridScene = (props: SceneProps) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scene, theme } = props;
  return (
    <>
      <Heading {...props} />
      <div style={{ display: "flex", gap: 30, marginTop: 110 }}>
        {scene.items.map((item, i) => (
          <div
            key={item.label}
            style={{
              flex: 1,
              padding: 40,
              minHeight: 250,
              borderRadius: theme.borderRadius,
              background: theme.surface,
              borderTop: `3px solid ${theme.primary}`,
              translate: `0 ${(1 - spring({ frame: Math.max(0, f - i * 7), fps, config: { damping: 200 } })) * 110}px`,
            }}
          >
            <div
              style={{ fontSize: 24, color: theme.secondary, marginBottom: 50 }}
            >
              0{i + 1}
            </div>
            <div style={{ fontSize: 40, fontWeight: 800 }}>{item.label}</div>
            <div style={{ fontSize: 24, color: theme.muted, marginTop: 20 }}>
              {item.detail}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

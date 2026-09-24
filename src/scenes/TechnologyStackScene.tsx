import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Heading, type SceneProps } from "./shared";
export const TechnologyStackScene = (props: SceneProps) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scene, theme } = props;
  return (
    <>
      <Heading {...props} />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          marginTop: 100,
          maxWidth: 1500,
        }}
      >
        {scene.items.map((item, i) => (
          <div
            key={item.label}
            style={{
              fontSize: i === 0 ? 74 : 52,
              fontWeight: 800,
              padding: "24px 44px",
              borderBottom: `3px solid ${i % 2 ? theme.secondary : theme.primary}`,
              background: theme.surface,
              translate: `0 ${(1 - spring({ frame: Math.max(0, f - i * 6), fps, config: { damping: 200 } })) * 80}px`,
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </>
  );
};

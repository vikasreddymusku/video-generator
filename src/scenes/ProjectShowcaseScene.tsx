import { useCurrentFrame } from "remotion";
import { Heading, type SceneProps } from "./shared";
export const ProjectShowcaseScene = (props: SceneProps) => {
  const f = useCurrentFrame();
  const { scene, theme } = props;
  return (
    <>
      <Heading {...props} />
      <div style={{ display: "flex", gap: 80, marginTop: 85 }}>
        <div
          style={{
            width: 520,
            padding: 45,
            borderLeft: `4px solid ${theme.primary}`,
            fontSize: 28,
            fontFamily: "monospace",
            background: theme.surface,
          }}
        >
          {scene.items.map((item, i) => (
            <div
              key={item.label}
              style={{ marginBottom: 32, opacity: f > i * 10 ? 1 : 0.25 }}
            >
              <span style={{ color: theme.primary }}>{"> "}</span>
              {item.label}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, paddingTop: 30 }}>
          {scene.items.map((item, i) => (
            <div
              key={item.label}
              style={{
                fontSize: 35,
                marginBottom: 40,
                translate: `${Math.max(0, 25 - f + i * 5)}px 0`,
              }}
            >
              <span style={{ color: theme.secondary, marginRight: 20 }}>
                0{i + 1}
              </span>
              {item.detail}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

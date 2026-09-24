import { useCurrentFrame } from "remotion";
import { Heading, type SceneProps } from "./shared";
export const HeroTitleScene = (props: SceneProps) => {
  const f = useCurrentFrame();
  return (
    <div style={{ paddingTop: 115 }}>
      <Heading {...props} />
      <div
        style={{
          height: 5,
          width: 700,
          background: props.theme.primary,
          marginTop: 48,
          scale: `${Math.min(1, f / 35)} 1`,
          transformOrigin: "left",
        }}
      />
      <div style={{ fontSize: 36, color: props.theme.muted, marginTop: 38 }}>
        {props.scene.supportingText[1]}
      </div>
      <div
        style={{
          position: "absolute",
          right: 135,
          bottom: 135,
          fontSize: 180,
          color: props.theme.primary,
          opacity: 0.12,
          fontFamily: "monospace",
        }}
      >
        {"{ }"}
      </div>
    </div>
  );
};

import { useCurrentFrame } from "remotion";
import { AnimatedTitle } from "../components/AnimatedTitle";
import type { SceneProps } from "./shared";
export const BrandIntroScene = ({ scene, theme, plan }: SceneProps) => {
  const f = useCurrentFrame();
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
      <svg
        width="130"
        height="130"
        viewBox="0 0 100 100"
        style={{ rotate: `${Math.max(0, 20 - f)}deg` }}
      >
        <path d="M15 20 H65 L90 50 65 80 H15 L40 50Z" fill={theme.primary} />
      </svg>
      <AnimatedTitle
        text={scene.headline}
        size={150}
        direction={scene.animationDirection}
      />
      <div style={{ fontSize: 30, letterSpacing: 6, color: theme.secondary }}>
        {plan.contact.tagline}
      </div>
    </div>
  );
};

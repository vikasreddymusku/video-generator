import { interpolate, useCurrentFrame } from "remotion";
import { AnimatedTitle } from "../components/AnimatedTitle";
import type { SceneProps } from "./shared";
export const CtaScene = ({ scene, theme, plan }: SceneProps) => {
  const f = useCurrentFrame();
  const c = plan.contact;
  return (
    <>
      <div style={{ color: theme.primary, fontSize: 30, marginBottom: 50 }}>
        {plan.brand}
      </div>
      <div style={{ display: "flex", gap: 100, alignItems: "center" }}>
        <div style={{ width: 790 }}>
          <AnimatedTitle text={scene.headline} size={82} />
          <div
            style={{
              display: "inline-block",
              marginTop: 55,
              padding: "25px 45px",
              border: `2px solid ${theme.primary}`,
              borderRadius: theme.borderRadius,
              color: theme.secondary,
              fontSize: 48,
              fontWeight: 900,
              scale: interpolate(f, [0, 18, 30, 45], [0.95, 1, 1.04, 1], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            {c.cta.toUpperCase()} →
          </div>
        </div>
        <div
          style={{
            flex: 1,
            borderLeft: `2px solid ${theme.primary}`,
            paddingLeft: 55,
          }}
        >
          {[c.website, c.email, c.phone].map((value) => (
            <div key={value} style={{ fontSize: 34, marginBottom: 28 }}>
              {value}
            </div>
          ))}
          <div style={{ fontSize: 24, lineHeight: 1.5, color: theme.muted }}>
            {c.address}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 110,
          fontSize: 26,
          letterSpacing: 5,
          color: theme.secondary,
        }}
      >
        {c.tagline}
      </div>
    </>
  );
};

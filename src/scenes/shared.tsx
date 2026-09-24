import type { ThemeConfig, VideoPlan, VideoScene } from "../automation/types";
import { AnimatedTitle } from "../components/AnimatedTitle";
export type SceneProps = {
  scene: VideoScene;
  theme: ThemeConfig;
  plan: VideoPlan;
};
export const Heading = ({ scene, theme }: SceneProps) => (
  <>
    <div
      style={{
        color: theme.primary,
        fontSize: 24,
        letterSpacing: 5,
        marginBottom: 26,
      }}
    >
      {scene.supportingText[0]}
    </div>
    <AnimatedTitle
      text={scene.headline}
      size={92}
      direction={scene.animationDirection}
    />
  </>
);

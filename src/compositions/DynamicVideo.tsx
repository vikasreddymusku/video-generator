import { AbsoluteFill, Sequence, staticFile, interpolate } from "remotion";
import { Audio } from "@remotion/media";
import type { VideoProps, VideoScene } from "../automation/types";
import { NetworkBackground } from "../components/NetworkBackground";
import { SceneTransition } from "../components/SceneTransition";
import { BrandIntroScene } from "../scenes/BrandIntroScene";
import { HeroTitleScene } from "../scenes/HeroTitleScene";
import { ProcessFlowScene } from "../scenes/ProcessFlowScene";
import { TechnologyStackScene } from "../scenes/TechnologyStackScene";
import { ProjectShowcaseScene } from "../scenes/ProjectShowcaseScene";
import { FeatureGridScene } from "../scenes/FeatureGridScene";
import { CtaScene } from "../scenes/CtaScene";
import type { SceneProps } from "../scenes/shared";
import type { FC } from "react";
import { CodeScene } from "../scenes/CodeScene";
import { DiagramScene } from "../scenes/DiagramScene";
import { MetricsScene } from "../scenes/MetricsScene";
import { BrandOutroScene } from "../scenes/BrandOutroScene";
import { UserVideoScene } from "../scenes/UserVideoScene";
const scenes: Record<VideoScene["type"], FC<SceneProps>> = {
  "brand-intro": BrandIntroScene,
  "brand-outro": BrandOutroScene,
  "hero-title": HeroTitleScene,
  "process-flow": ProcessFlowScene,
  "technology-stack": TechnologyStackScene,
  "project-showcase": ProjectShowcaseScene,
  "feature-grid": FeatureGridScene,
  code: CodeScene,
  diagram: DiagramScene,
  metrics: MetricsScene,
  cta: CtaScene,
};
export const DynamicVideo: FC<VideoProps> = ({ plan, theme, audio, mix, branding, hybrid }) => (
  <AbsoluteFill
    style={{
      background: theme.background,
      color: theme.text,
      fontFamily: theme.fontFamily,
      overflow: "hidden",
    }}
  >
    {hybrid?.visualSource === "USER_VIDEO" && hybrid.userVideoAsset ? (
      <Sequence
        from={branding?.intro.frames ?? 0}
        durationInFrames={Math.max(
          1,
          plan.totalFrames -
            (branding?.intro.frames ?? 0) -
            (branding?.outro.frames ?? 0),
        )}
      >
        <UserVideoScene
          asset={hybrid.userVideoAsset}
          volume={hybrid.userVideoVolume ?? 0.15}
        />
      </Sequence>
    ) : null}
    {plan.scenes.map((scene) => {
      if (
        hybrid?.visualSource === "USER_VIDEO" &&
        scene.type !== "brand-intro" &&
        scene.type !== "brand-outro"
      ) {
        return null;
      }
      const Component = scenes[scene.type];
      return (
        <Sequence
          key={scene.id}
          name={scene.headline}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          <AbsoluteFill style={{ background: theme.background }}>
            <div
              style={{
                position: "absolute",
                width: 1920,
                height: 1080,
                scale: `${plan.width / 1920} ${plan.height / 1080}`,
                transformOrigin: "top left",
              }}
            >
              <NetworkBackground theme={theme} quiet={scene.type === "cta"} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "110px 140px",
                  boxSizing: "border-box",
                }}
              >
                <Component scene={scene} theme={theme} plan={plan} branding={branding} />
              </div>
              <SceneTransition style={scene.transition} theme={theme} />
            </div>
          </AbsoluteFill>
          {scene.suggestedSfx.map((sfx) =>
            audio.sfx[sfx] ? (
              <Audio
                key={sfx}
                src={staticFile(audio.sfx[sfx]!)}
                volume={() =>
                  sfx === "click"
                    ? Math.min(0.25, mix.sfxVolume)
                    : mix.sfxVolume
                }
              />
            ) : null,
          )}
        </Sequence>
      );
    })}
    {audio.voiceover && <Sequence from={branding?.intro.frames ?? 0}><Audio src={staticFile(audio.voiceover)} volume={() => mix.voiceVolume} /></Sequence>}
    {audio.music && (
      <Audio
        src={staticFile(audio.music)}
        loop
        volume={(f) =>
          mix.musicVolume *
          interpolate(
            f,
            [0, 30, plan.totalFrames - 45, plan.totalFrames],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
    )}
  </AbsoluteFill>
);

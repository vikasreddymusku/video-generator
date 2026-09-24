import React from "react";
import { Composition } from "remotion";
import { DynamicVideo } from "./compositions/DynamicVideo";
import preview from "./generated/preview.json";
import type { VideoProps } from "./automation/types";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {[preview.plan.compositionId, "DynamicVideo"].map((id) => (
        <Composition
          key={id}
          id={id}
          component={DynamicVideo}
          defaultProps={preview as VideoProps}
          durationInFrames={preview.plan.totalFrames}
          fps={preview.plan.fps}
          width={preview.plan.width}
          height={preview.plan.height}
          calculateMetadata={({ props }) => ({
            durationInFrames: props.plan.totalFrames,
            fps: props.plan.fps,
            width: props.plan.width,
            height: props.plan.height,
          })}
        />
      ))}
    </>
  );
};

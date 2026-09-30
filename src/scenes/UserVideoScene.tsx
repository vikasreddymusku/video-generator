import { Video } from "@remotion/media";
import { staticFile } from "remotion";
import type { FC } from "react";

export const UserVideoScene: FC<{
  asset: string;
  volume: number;
}> = ({ asset, volume }) => (
  <Video
    src={staticFile(asset)}
    objectFit="cover"
  style={{
    width: "100%",
    height: "100%",
  }}
    volume={volume}
  />
);
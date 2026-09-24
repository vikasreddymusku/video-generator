import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffprobe from "ffprobe-static";
import { stat } from "node:fs/promises";
const exec = promisify(execFile);
export type Probe = {
  format: { duration: string };
  streams: {
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    nb_frames?: string;
  }[];
};
export async function probe(file: string): Promise<Probe> {
  if ((await stat(file)).size === 0)
    throw new Error(`Empty media file: ${file}`);
  const { stdout } = await exec(
    ffprobe.path,
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
    { windowsHide: true },
  );
  const result = JSON.parse(stdout) as Probe;
  if (
    !Number.isFinite(Number(result.format.duration)) ||
    Number(result.format.duration) <= 0
  )
    throw new Error(`Invalid media duration: ${file}`);
  return result;
}
export async function audioDuration(file: string) {
  const result = await probe(file);
  if (!result.streams.some((s) => s.codec_type === "audio"))
    throw new Error(`No audio stream: ${file}`);
  return Number(result.format.duration);
}

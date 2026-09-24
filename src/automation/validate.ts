import { probe, audioDuration } from "./media";
import type { ValidationResult, VideoPlan } from "./types";
export async function validateVideo(
  file: string,
  voiceFile: string,
  plan: VideoPlan,
  tolerance: number,
  renderSucceeded: boolean,
): Promise<ValidationResult> {
  const checks: Record<string, boolean> = { renderSucceeded };
  const errors: string[] = [];
  try {
    const info = await probe(file);
    const video = info.streams.find((s) => s.codec_type === "video");
    const [n, d] = (video?.avg_frame_rate ?? "0/1").split("/").map(Number);
    checks.nonemptyPlayableVideo = Boolean(video?.codec_name);
    checks.dimensions =
      video?.width === plan.width && video?.height === plan.height;
    checks.fps = Number.isFinite(n / d) && Math.abs(n / d - plan.fps) < 0.001;
    checks.duration =
      Math.abs(Number(info.format.duration) - plan.durationSeconds) <=
      tolerance;
    checks.frameCount = Number(video?.nb_frames) === plan.totalFrames;
    checks.audioStream = info.streams.some((s) => s.codec_type === "audio");
    const duration = await audioDuration(voiceFile);
    checks.voiceover = duration > 0 && duration <= plan.durationSeconds - 0.15;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  for (const [name, passed] of Object.entries(checks))
    if (!passed) errors.push(`Failed: ${name}`);
  return { valid: errors.length === 0, checks, errors };
}

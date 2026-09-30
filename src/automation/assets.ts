import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { audioDuration } from "./media";
import type { AudioAssets } from "./types";
export async function prepareAssets(
  root: string,
  slug: string,
  voiceFile?: string,
): Promise<AudioAssets> {
  const assets: AudioAssets = { sfx: {} };
  if (voiceFile) {
    await audioDuration(voiceFile);
    const extension = path.extname(voiceFile).toLowerCase() || ".mp3";
    const relative = `generated/${slug}/voiceover${extension}`;
    await mkdir(path.join(root, "public", "generated", slug), {
      recursive: true,
    });
    await copyFile(voiceFile, path.join(root, "public", relative));
    assets.voiceover = relative;
  }
  for (const [name, filename] of Object.entries({
    music: "music.mp3",
    whoosh: "whoosh.wav",
    click: "click.wav",
    impact: "impact.wav",
  })) {
    try {
      await audioDuration(path.join(root, "public", "audio", filename));
      if (name === "music") assets.music = `audio/${filename}`;
      else assets.sfx[name as keyof AudioAssets["sfx"]] = `audio/${filename}`;
    } catch {
      /* Optional absent, empty or invalid media is omitted. */
    }
  }
  return assets;
}

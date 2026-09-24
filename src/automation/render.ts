import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { hash, readJson, save } from "./io";
import { validateVideo } from "./validate";
import type { VideoProps } from "./types";
async function sourceFingerprint(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const values: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) values.push(...(await sourceFingerprint(file)));
    else values.push(entry.name + hash(await readFile(file)));
  }
  return values;
}
export async function renderVideo(
  root: string,
  directory: string,
  props: VideoProps,
  voiceFile: string,
  tolerance: number,
  force: boolean,
) {
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, "final.mp4");
  const receiptFile = path.join(directory, "render-receipt.json");
  const assetPaths = [
    props.audio.voiceover,
    props.audio.music,
    ...Object.values(props.audio.sfx),
  ].filter((v): v is string => Boolean(v));
  const assetHashes = await Promise.all(
    assetPaths.map(async (p) =>
      hash(await readFile(path.join(root, "public", p))),
    ),
  );
  const fingerprint = hash(
    JSON.stringify({
      props,
      assetHashes,
      source: await sourceFingerprint(path.join(root, "src")),
      lock: hash(await readFile(path.join(root, "package-lock.json"))),
    }),
  );
  try {
    const receipt = (await readJson(receiptFile)) as {
      hash: string;
      outputHash: string;
    };
    if (
      !force &&
      receipt.hash === fingerprint &&
      receipt.outputHash === hash(await readFile(output)) &&
      (await validateVideo(output, voiceFile, props.plan, tolerance, true))
        .valid
    )
      return output;
  } catch {
    /* A receipt without a valid matching MP4 cannot skip rendering. */
  }
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src", "index.ts"),
    publicDir: path.join(root, "public"),
  });
  const composition = await selectComposition({
    serveUrl,
    id: "DynamicVideo",
    inputProps: props,
  });
  await renderStill({
    serveUrl,
    composition,
    inputProps: props,
    output: path.join(directory, "poster.png"),
    frame: Math.min(
      props.plan.totalFrames - 1,
      (props.plan.scenes[1]?.startFrame ?? 0) + 30,
    ),
  });
  const pending = path.join(directory, "final.pending.mp4");
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: pending,
    concurrency: 2,
  });
  const validation = await validateVideo(
    pending,
    voiceFile,
    props.plan,
    tolerance,
    true,
  );
  if (!validation.valid) {
    await save(path.join(directory, "..", "validation.json"), validation);
    throw new Error(validation.errors.join("\n"));
  }
  await rename(pending, output);
  await save(receiptFile, {
    hash: fingerprint,
    outputHash: hash(await readFile(output)),
    succeeded: true,
  });
  return output;
}

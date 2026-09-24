import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(file, "utf8"));
export async function save(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file + ".tmp",
    typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
  );
  await rename(file + ".tmp", file);
}
export function localPath(root: string, target: string) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base + path.sep))
    throw new Error(`Path must stay within ${base}: ${target}`);
  return resolved;
}

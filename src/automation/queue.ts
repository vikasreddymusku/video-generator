import { readFile } from "node:fs/promises";
import { save } from "./io";
import type { QueueItem, ValidationResult } from "./types";
export function parseQueue(raw: string): QueueItem[] {
  return raw.split(/\r?\n/).flatMap((original, line) => {
    const match = original.match(
      /^\s*[*-]\s+([^<]+?)\s*(<!--\s*done(?:\s+source-sha256:[a-f0-9]{64})?\s*-->)?\s*$/i,
    );
    return match
      ? [{ source: match[1], line, original, done: Boolean(match[2]) }]
      : [];
  });
}
export async function loadQueue(file: string, force = false) {
  return parseQueue(await readFile(file, "utf8")).filter(
    (item) => force || !item.done,
  );
}
export async function markDone(
  file: string,
  item: QueueItem,
  validation: ValidationResult,
) {
  if (
    !validation.valid ||
    validation.errors.length ||
    !Object.values(validation.checks).every(Boolean)
  )
    throw new Error("Cannot complete an unvalidated queue item");
  const raw = await readFile(file, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines[item.line] !== item.original)
    throw new Error("Queue changed during processing; completion not written");
  if (!item.done) lines[item.line] += " <!-- done -->";
  await save(file, lines.join(raw.includes("\r\n") ? "\r\n" : "\n"));
}

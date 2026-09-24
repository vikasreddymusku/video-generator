import { readFile } from "node:fs/promises";
import path from "node:path";
import { hash, localPath } from "./io";

export type SourceDocument = {
  type: "local" | "remote";
  originalReference: string;
  resolvedReference: string;
  content: string;
  sourceHash: string;
  sourceName: string;
  fetchedAt: string;
};
export const normalizeSource = (content: string) =>
  content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
export const isRemoteReference = (reference: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(reference);
export function resolveSourceUrl(reference: string): URL {
  const url = new URL(reference);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      "Markdown source URLs must use HTTPS without embedded credentials.",
    );
  url.hash = "";
  if (url.hostname === "github.com") {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (!match)
      throw new Error(
        "GitHub Markdown URLs must use /OWNER/REPO/blob/REF/PATH.md or raw.githubusercontent.com.",
      );
    return new URL(
      `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`,
    );
  }
  return url;
}
export async function readBoundedResponse(
  response: Response,
  limit: number,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error(`Response exceeds ${limit} bytes.`);
  }
  if (!response.body) throw new Error("Empty response body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error(`Response exceeds ${limit} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}
export async function loadSource(
  reference: string,
  options: {
    root?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  } = {},
): Promise<SourceDocument> {
  const limit = options.maxBytes ?? 2 * 1024 * 1024;
  const type = isRemoteReference(reference) ? "remote" : "local";
  let content: string;
  let resolvedReference: string;
  if (type === "local") {
    resolvedReference = localPath(options.root ?? process.cwd(), reference);
    content = await readFile(resolvedReference, "utf8");
  } else {
    let url = resolveSourceUrl(reference);
    const signal = AbortSignal.timeout(options.timeoutMs ?? 20000);
    const fetchSource = options.fetch ?? fetch;
    try {
      for (let redirects = 0; ; redirects++) {
        const response = await fetchSource(url.href, {
          redirect: "manual",
          signal,
          credentials: "omit",
          headers: { Accept: "text/markdown, text/plain;q=0.9" },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          if (redirects >= (options.maxRedirects ?? 5))
            throw new Error("Too many Markdown source redirects.");
          const location = response.headers.get("location");
          if (!location)
            throw new Error(
              `HTTP ${response.status}: redirect has no Location header.`,
            );
          url = resolveSourceUrl(new URL(location, url).href);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(
            `Markdown source HTTP ${response.status} ${response.statusText}`,
          );
        }
        if (
          /text\/html|application\/xhtml/i.test(
            response.headers.get("content-type") ?? "",
          )
        ) {
          await response.body?.cancel();
          throw new Error("Expected Markdown, received an HTML page.");
        }
        content = await readBoundedResponse(response, limit);
        resolvedReference = url.href;
        break;
      }
    } catch (error) {
      if (signal.aborted)
        throw new Error(
          `Markdown source timed out after ${options.timeoutMs ?? 20000}ms.`,
        );
      throw error;
    }
    if (/^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(content))
      throw new Error("Expected Markdown, received HTML content.");
  }
  content = normalizeSource(content);
  if (!content.trim()) throw new Error("Markdown source is empty.");
  return {
    type,
    originalReference: reference,
    resolvedReference,
    content,
    sourceHash: hash(content),
    sourceName: path.basename(
      type === "remote"
        ? new URL(resolvedReference).pathname
        : resolvedReference,
    ),
    fetchedAt: new Date().toISOString(),
  };
}

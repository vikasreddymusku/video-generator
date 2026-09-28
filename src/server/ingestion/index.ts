import path from "node:path";
import { load } from "cheerio";
import { loadSource, normalizeSource } from "../../automation/source-loader";
import { firstH1 } from "../../automation/resolve-metadata";
import { ClientError, validateName } from "../security";
import type { NormalizedSource, SourceSection, SourceType } from "../contracts";
import { officeSections } from "./office";
import { MAX_SOURCE_BYTES, safeDownload } from "./remote";
export const extensions: Record<string, SourceType> = {
  ".md": "MARKDOWN",
  ".txt": "TEXT",
  ".pdf": "PDF",
  ".docx": "DOCX",
  ".pptx": "PPTX",
};
const mimeTypes: Record<Exclude<SourceType, "VIDEO">, string[]> = {
  MARKDOWN: ["text/markdown", "text/plain", "text/x-markdown"],
  TEXT: ["text/plain"],
  PDF: ["application/pdf"],
  DOCX: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  PPTX: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  WEBPAGE: ["text/html", "application/xhtml+xml"],
};
export function detectType(name: string): SourceType {
  return extensions[path.extname(name).toLowerCase()] ?? "WEBPAGE";
}
export function validateUpload(name: string, bytes: Buffer) {
  validateName(name);
  const type = extensions[path.extname(name).toLowerCase()];
  if (!type)
    throw new ClientError("Supported files: .md, .txt, .pdf, .docx and .pptx.");
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
    throw new ClientError("Each source must be nonempty and at most 20 MB.");
  if (type === "PDF" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new ClientError("The file is not a PDF document.");
  if (
    (type === "DOCX" || type === "PPTX") &&
    (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50)
  )
    throw new ClientError("The file is not an Office document.");
  if (type === "MARKDOWN" || type === "TEXT") decodeText(bytes);
  return type;
}
function decodeText(bytes: Buffer) {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ClientError("Text documents must use UTF-8 encoding.");
  }
  if (
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code < 9 || (code > 13 && code < 32);
    }) ||
    /^\s*(?:<!doctype|<html)/i.test(value)
  )
    throw new ClientError(
      "Expected a text document, received binary or HTML content.",
    );
  return normalizeSource(value);
}
export async function extractSource(
  bytes: Buffer,
  name: string,
  type: SourceType,
  reference = name,
): Promise<NormalizedSource> {
  if (bytes.length > MAX_SOURCE_BYTES)
    throw new ClientError("Source exceeds 20 MB.");
  let content = "";
  let sections: SourceSection[] = [];
  let assets: { name: string; bytes: number }[] = [];
  let title = name.replace(/\.[^.]+$/, "");
  if (type === "MARKDOWN" || type === "TEXT") {
    content = decodeText(bytes);
    title = firstH1(content) ?? title;
    sections = [{ heading: title, text: content }];
  } else if (type === "WEBPAGE") {
    const $ = load(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    title =
      $("title").first().text().trim() ||
      $("h1").first().text().trim() ||
      title;
    $(
      "script,style,nav,footer,header,aside,noscript,form,svg,[role=navigation],[role=banner],[id*=cookie],[class*=cookie]",
    ).remove();
    const main = $("main,article,[role=main]").first();
    const root = main.length ? main : $("body");
    let heading = title;
    let parts: string[] = [];
    root.find("h1,h2,h3,h4,h5,h6,p,li,pre,tr").each((_, el) => {
      const tag = el.tagName;
      const node = $(el);
      if (node.parents("li,pre,tr").length) return;
      const text = node.text().trim();
      if (!text) return;
      if (/^h[1-6]$/.test(tag)) {
        if (parts.length) sections.push({ heading, text: parts.join("\n\n") });
        heading = text;
        parts = [];
      } else
        parts.push(
          tag === "li"
            ? "- " + text
            : tag === "pre"
              ? "```\n" + text + "\n```"
              : text,
        );
    });
    if (parts.length) sections.push({ heading, text: parts.join("\n\n") });
    if (!sections.length)
      sections = [{ heading: title, text: root.text().trim() }];
  } else if (type === "PDF") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new ClientError("Not a PDF document.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      disableFontFace: true,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 500) throw new ClientError("PDF exceeds 500 pages.");
      for (let page = 1; page <= pdf.numPages; page++) {
        const p = await pdf.getPage(page);
        const data = await p.getTextContent();
        sections.push({
          heading: `Page ${page}`,
          page,
          text: data.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("")
            .trim(),
        });
        p.cleanup();
      }
    } finally {
      await task.destroy();
    }
    if (!sections.some((s) => s.text.trim()))
      throw new ClientError(
        "This PDF has no extractable text. Export a text-based PDF or run OCR before uploading.",
      );
  } else {
    ({ sections, assets } = await officeSections(bytes, type));
  }
  if (!content)
    content = sections.map((s) => `## ${s.heading}\n\n${s.text}`).join("\n\n");
  if (!sections.some((s) => s.text.trim()) || content.length > 4 * 1024 * 1024)
    throw new ClientError(
      "Document contains no usable text or exceeds the extracted text limit.",
    );
  return {
    sourceType: type,
    sourceReference: reference,
    originalName: name,
    title,
    content,
    sections,
    provenance: {
      reference,
      extractedAt: new Date().toISOString(),
      ...(type === "PDF" ? { pageCount: sections.length } : {}),
      ...(type === "PPTX" ? { slideCount: sections.length } : {}),
      assets,
      warnings: assets.length
        ? [
            "Embedded images are listed as metadata; OCR and image interpretation are not performed.",
          ]
        : [],
    },
  };
}
export async function ingestLocal(
  file: string,
  name: string,
  root: string,
  bytes: Buffer,
) {
  const type = validateUpload(name, bytes);
  const normalized = await extractSource(bytes, name, type);
  if (type === "MARKDOWN")
    normalized.content = (await loadSource(file, { root })).content;
  return normalized;
}
export async function ingestRemote(reference: string, download = safeDownload) {
  const result = await download(reference);
  const name = decodeURIComponent(
    new URL(result.url).pathname.split("/").pop() || "webpage",
  );
  let type = detectType(name);
  if (type === "WEBPAGE")
    type =
      (Object.keys(mimeTypes) as SourceType[]).find((t) =>
        mimeTypes[t].includes(result.mime),
      ) ?? "WEBPAGE";
  if (!mimeTypes[type].includes(result.mime))
    throw new ClientError(
      "The remote content type does not match a supported source format.",
    );
  const normalized = await extractSource(result.bytes, name, type, reference);
  if (type === "MARKDOWN")
    normalized.content = (
      await loadSource(reference, {
        fetch: async () =>
          new Response(new Uint8Array(result.bytes), {
            headers: { "content-type": result.mime },
          }),
        maxBytes: MAX_SOURCE_BYTES,
      })
    ).content;
  return normalized;
}

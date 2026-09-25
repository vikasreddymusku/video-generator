import yauzl from "yauzl";
import { DOMParser, type Element } from "@xmldom/xmldom";
import path from "node:path";
import { ClientError } from "../security";
import type { SourceSection } from "../contracts";

export async function readOffice(bytes: Buffer) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new ClientError("Malformed Office document."));
          return;
        }
        const files = new Map<string, Buffer>();
        let expanded = 0,
          count = 0;
        const fail = (e: unknown) => {
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("end", () => resolve(files));
        zip.on("entry", (entry) => {
          if (
            ++count > 3000 ||
            entry.fileName.includes("\\") ||
            entry.fileName.split("/").includes("..") ||
            /^(?:\/|[A-Za-z]:)/.test(entry.fileName) ||
            entry.generalPurposeBitFlag & 1 ||
            (expanded += entry.uncompressedSize) > 60 * 1024 * 1024 ||
            entry.uncompressedSize > 10 * 1024 * 1024 ||
            entry.uncompressedSize / Math.max(1, entry.compressedSize) > 300
          ) {
            fail(new ClientError("Unsafe or oversized Office archive."));
            return;
          }
          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) {
              fail(new ClientError("Unreadable Office archive."));
              return;
            }
            const chunks: Buffer[] = [];
            let actual = 0;
            stream.on("data", (chunk) => {
              actual += chunk.length;
              if (actual > entry.uncompressedSize || actual > 10 * 1024 * 1024)
                stream.destroy(new ClientError("Office entry exceeds limits."));
              else chunks.push(chunk);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              files.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
const elements = (root: Element, local: string) =>
  Array.from(root.getElementsByTagName("*")).filter(
    (e) => e.localName === local,
  );
function xml(bytes: Buffer | undefined) {
  if (!bytes)
    throw new ClientError("Required Office document content is missing.");
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(value))
    throw new ClientError("Document entity declarations are not allowed.");
  const doc = new DOMParser({
    onError: () => {
      throw new ClientError("Malformed document XML.");
    },
  }).parseFromString(value, "text/xml");
  return doc.documentElement!;
}
const text = (root: Element) =>
  elements(root, "t")
    .map((e) => e.textContent ?? "")
    .join("");
function paragraphs(root: Element) {
  return elements(root, "p")
    .map((p) => {
      const style = elements(p, "pStyle")[0]?.getAttribute("w:val") ?? "";
      const heading = /heading([1-6])/i.exec(style)?.[1];
      const bullet =
        elements(p, "numPr").length ||
        elements(p, "buChar").length ||
        elements(p, "buAutoNum").length;
      return `${heading ? "#".repeat(Number(heading)) + " " : bullet ? "- " : ""}${text(p)}`;
    })
    .filter((v) => v.trim())
    .join("\n\n");
}
export async function officeSections(bytes: Buffer, type: "DOCX" | "PPTX") {
  const files = await readOffice(bytes);
  if (!files.has("[Content_Types].xml"))
    throw new ClientError("Not a valid Office document.");
  const assets = [...files]
    .filter(([name]) => /^(word|ppt)\/media\//.test(name))
    .map(([name, b]) => ({ name, bytes: b.length }));
  const sections: SourceSection[] = [];
  if (type === "DOCX") {
    const body = elements(xml(files.get("word/document.xml")), "body")[0];
    if (!body) throw new ClientError("Word document has no body.");
    let heading = "Document";
    let parts: string[] = [];
    const flush = () => {
      if (parts.length) sections.push({ heading, text: parts.join("\n\n") });
      parts = [];
    };
    for (const node of Array.from(body.childNodes)) {
      if (node.nodeType !== 1) continue;
      const element = node as Element;
      if (element.localName === "p") {
        const value = paragraphsWrapper(element);
        if (/^#{1,6} /.test(value)) {
          flush();
          heading = value.replace(/^#+ /, "");
        }
        parts.push(value);
      } else if (element.localName === "tbl")
        parts.push(
          elements(element, "tr")
            .map((row) =>
              elements(row, "tc")
                .map((cell) => text(cell))
                .join(" | "),
            )
            .join("\n"),
        );
    }
    flush();
  } else {
    const presentation = xml(files.get("ppt/presentation.xml"));
    const rels = xml(files.get("ppt/_rels/presentation.xml.rels"));
    const relation = new Map(
      elements(rels, "Relationship").map((r) => [r.getAttribute("Id"), r]),
    );
    for (const [index, slideId] of elements(presentation, "sldId").entries()) {
      const rel = relation.get(slideId.getAttribute("r:id"));
      if (!rel || rel.getAttribute("TargetMode") === "External")
        throw new ClientError("Invalid slide relationship.");
      const target = rel.getAttribute("Target") ?? "";
const slidePath = path.posix.normalize(
  target.startsWith("/")
    ? target.slice(1)
    : path.posix.join("ppt", target),
);
      if (!slidePath.startsWith("ppt/slides/"))
        throw new ClientError("Unsafe slide reference.");
      const slide = xml(files.get(slidePath));
      const title = elements(slide, "sp").find((s) =>
        elements(s, "ph").some((p) =>
          ["title", "ctrTitle"].includes(p.getAttribute("type") ?? ""),
        ),
      );
      let content = slideContent(slide);
      const relPath = path.posix.join(
        path.posix.dirname(slidePath),
        "_rels",
        path.posix.basename(slidePath) + ".rels",
      );
      if (files.has(relPath))
        for (const noteRel of elements(
          xml(files.get(relPath)),
          "Relationship",
        )) {
          if (
            !noteRel.getAttribute("Type")?.endsWith("/notesSlide") ||
            noteRel.getAttribute("TargetMode") === "External"
          )
            continue;
          const noteTarget = noteRel.getAttribute("Target") ?? "";
const notePath = path.posix.normalize(
  noteTarget.startsWith("/")
    ? noteTarget.slice(1)
    : path.posix.join(path.posix.dirname(slidePath), noteTarget),

          );
          if (!notePath.startsWith("ppt/notesSlides/"))
            throw new ClientError("Unsafe notes reference.");
          const notes = xml(files.get(notePath));
          const body = elements(notes, "sp")
            .filter(
              (s) =>
                !elements(s, "ph").some((p) =>
                  ["sldNum", "hdr", "ftr", "dt", "sldImg"].includes(
                    p.getAttribute("type") ?? "",
                  ),
                ),
            )
            .map(paragraphs)
            .join("\n");
          if (body.trim()) content += "\n\nSpeaker notes:\n" + body;
        }
      sections.push({
        heading: `Slide ${index + 1}${title ? ": " + (elements(title, "p")[0] ? text(elements(title, "p")[0]) : text(title)) : ""}`,
        text: content,
        slide: index + 1,
      });
    }
  }
  return { sections, assets };
}
function slideContent(root: Element): string {
  if (root.localName === "tbl")
    return elements(root, "tr")
      .map((row) => elements(row, "tc").map(text).join(" | "))
      .join("\n");
  if (root.localName === "p") {
    const bullet =
      elements(root, "buChar").length || elements(root, "buAutoNum").length;
    return `${bullet ? "- " : ""}${text(root)}`;
  }
  return Array.from(root.childNodes)
    .filter((node) => node.nodeType === 1)
    .map((node) => slideContent(node as Element))
    .filter((value) => value.trim())
    .join("\n\n");
}
function paragraphsWrapper(element: Element) {
  const style = elements(element, "pStyle")[0]?.getAttribute("w:val") ?? "";
  const level = /heading([1-6])/i.exec(style)?.[1];
  return `${level ? "#".repeat(Number(level)) + " " : elements(element, "numPr").length ? "- " : ""}${text(element)}`;
}

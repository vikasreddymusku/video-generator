import matter from "gray-matter";
import { loadSource, type SourceDocument } from "./source-loader";
import {
  rawFrontmatterSchema,
  resolveMetadata,
  loadMetadataContext,
  type MetadataContext,
} from "./resolve-metadata";
export async function loadContent(
  file: string,
  context = loadMetadataContext(),
) {
  return parseContent(await loadSource(file), context);
}
export function parseContent(
  source: SourceDocument,
  context: MetadataContext = loadMetadataContext(),
) {
  const raw = source.content;
  // gray-matter supports executable frontmatter engines. Only YAML is content.
  if (/^---[^\n]+\n/.test(raw))
    throw new Error(
      "Only YAML frontmatter delimited by plain --- lines is supported.",
    );
  const parsed = matter(raw);
  const result = rawFrontmatterSchema.safeParse(parsed.data);
  if (!result.success)
    throw new Error(
      `${source.sourceName}: invalid frontmatter: ${result.error.message}`,
    );
  const sections: Record<string, string> = {};
  const metadata = resolveMetadata(
    result.data,
    parsed.content,
    source,
    context,
  );
  for (const match of parsed.content.matchAll(
    /^## (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm,
  ))
    sections[match[1].trim()] = match[2].trim();
  const suppliedVoiceover =
    sections["Continuous ElevenLabs Voice-Over Text"] ??
    sections["Voice-Over Text"] ??
    sections["Voiceover"] ??
    "";
  if (metadata.voiceover_mode === "supplied" && !suppliedVoiceover)
    throw new Error(
      "voiceover_mode=supplied requires an approved Continuous ElevenLabs Voice-Over Text (or Voice-Over Text / Voiceover) section.",
    );
  return {
    frontmatter: result.data,
    metadata,
    body: parsed.content,
    sourceHash: source.sourceHash,
    originalReference: source.originalReference,
    resolvedReference: source.resolvedReference,
    sourceType: source.type,
    fetchedAt: source.fetchedAt,
    sourceName: source.sourceName,
    raw,
    sections,
    audience: sections["Primary Audience"] ?? "",
    positioning: sections["Course Positioning"] ?? "",
    courseContent: sections["What Students Learn"] ?? "",
    technologies: sections["Technology Stack"] ?? "",
    projects: sections["Hands-On Project Direction"] ?? "",
    benefits: sections["Program Highlights"] ?? "",
    suppliedVoiceover,
  };
}
export type ContentInput = Awaited<ReturnType<typeof loadContent>>;

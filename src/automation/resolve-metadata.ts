import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  configSchema,
  themeCatalogSchema,
  type AutomationConfig,
  type ThemeCatalog,
} from "./types";
import type { SourceDocument } from "./source-loader";

const text = z.string().trim().min(1);
const reserved = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const safeSlug = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine(
    (s) => !reserved.test(s),
    "Slug must not be a reserved filesystem name",
  );
export const resolvedContentMetadataSchema = z.object({
  title: text,
  slug: safeSlug,
  brand: text,
  duration_mode: z.enum(["auto", "fixed"]),
duration_seconds: z.number().finite().positive().optional(),
  fps: z.number().finite().positive(),
  resolution: z.string().regex(/^[1-9]\d*x[1-9]\d*$/),
  theme: text,
  voiceover_mode: z.enum(["auto", "supplied", "hybrid"]),
  video_type: text,
  cta: text,
  website: text,
  email: z.email(),
  phone: text,
  address: text,
  tagline: text,
});
// Whitelist only content/presentation fields; unknown keys are stripped.
export const rawFrontmatterSchema = resolvedContentMetadataSchema.partial();
export type RawFrontmatter = z.infer<typeof rawFrontmatterSchema>;
export type ResolvedContentMetadata = z.infer<
  typeof resolvedContentMetadataSchema
>;
export type MetadataContext = {
  config: AutomationConfig;
  themes: ThemeCatalog;
  themeOverride?: string;
};
export function loadMetadataContext(root = process.cwd()): MetadataContext {
  return {
    config: configSchema.parse(
      JSON.parse(
        readFileSync(path.join(root, "automation.config.json"), "utf8"),
      ),
    ),
    themes: themeCatalogSchema.parse(
      JSON.parse(readFileSync(path.join(root, "themes.json"), "utf8")),
    ),
  };
}
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
  return reserved.test(slug) ? `video-${slug}` : slug;
}
export function humanizeFilename(sourceName: string): string {
  let name = sourceName;
  try {
    name = decodeURIComponent(name);
  } catch {
    /* Keep literal names with invalid percent sequences. */
  }
  const stem = path.basename(name).replace(/\.(?:md|markdown|mdown)$/i, "");
  const acronyms: Record<string, string> = {
    sqlserver: "SQL Server",
    sql: "SQL",
    ddl: "DDL",
    dml: "DML",
    api: "API",
    aws: "AWS",
    ai: "AI",
    ml: "ML",
    http: "HTTP",
    https: "HTTPS",
    json: "JSON",
    csv: "CSV",
    xml: "XML",
    html: "HTML",
    css: "CSS",
    ui: "UI",
    url: "URL",
    tsql: "T-SQL",
  };
  return stem
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(
      (word) =>
        acronyms[word.toLowerCase()] ?? word[0].toUpperCase() + word.slice(1),
    )
    .join(" ");
}
function headingText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_`]/g, "")
    .trim();
}
export function firstH1(body: string): string | undefined {
  let fence: string | undefined;
  let fenceLength = 0;
  let previous = "";
  let inComment = false;
  for (const rawLine of body.split("\n")) {
    let line = rawLine;
    if (inComment) {
      const end = line.indexOf("-->");
      if (end < 0) continue;
      line = line.slice(end + 3);
      inComment = false;
    }
    const comment = line.indexOf("<!--");
    if (comment >= 0) {
      const end = line.indexOf("-->", comment);
      if (end < 0) {
        inComment = true;
        line = line.slice(0, comment);
      } else line = line.slice(0, comment) + line.slice(end + 3);
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) {
        fence = marker[1][0];
        fenceLength = marker[1].length;
      } else if (marker[1][0] === fence && marker[1].length >= fenceLength)
        fence = undefined;
      previous = "";
      continue;
    }
    if (fence) continue;
    const atx = line.match(/^ {0,3}#\s+(.+?)(?:\s+#+\s*)?$/);
    if (atx) {
      const title = headingText(atx[1]);
      if (title) return title;
    }
    if (/^ {0,3}=+\s*$/.test(line) && previous.trim()) {
      const title = headingText(previous);
      if (title) return title;
    }
    previous = /^(?: {4}|\t|\s*[-*>#])/.test(line) ? "" : line;
  }
  return undefined;
}
export function resolveMetadata(
  frontmatter: RawFrontmatter,
  body: string,
  source: SourceDocument,
  context: MetadataContext,
): ResolvedContentMetadata {
  const { config, themes } = context;
  const filenameTitle = humanizeFilename(source.sourceName);
  const title = frontmatter.title ?? firstH1(body) ?? filenameTitle;
  const slug = frontmatter.slug ?? (slugify(title) || slugify(filenameTitle));
  const theme =
    context.themeOverride ??
    frontmatter.theme ??
    config.video.theme ??
    themes.active ??
    "tinitiate-dark-yellow";
  if (!Object.prototype.hasOwnProperty.call(themes.themes, theme))
    throw new Error(`Unknown theme: ${theme}`);
  const brand = config.brand ?? {};

  const explicitDuration = frontmatter.duration_seconds;

if (
  frontmatter.duration_mode === "auto" &&
  explicitDuration !== undefined
) {
  throw new Error(
    "duration_seconds cannot be supplied when duration_mode=auto. Use duration_mode=fixed or remove duration_seconds.",
  );
}

const durationMode =
  explicitDuration !== undefined
    ? "fixed"
    : (frontmatter.duration_mode ?? config.video.durationMode);

const durationSeconds =
  durationMode === "fixed"
    ? (explicitDuration ?? config.video.durationSeconds)
    : undefined;

if (durationMode === "fixed" && durationSeconds === undefined) {
  throw new Error(
    "Fixed duration mode requires duration_seconds in frontmatter or video.durationSeconds in automation.config.json.",
  );
}


  const result = resolvedContentMetadataSchema.safeParse({
    title,
    slug,
    brand: frontmatter.brand ?? brand.name,
    duration_mode: durationMode,
duration_seconds: durationSeconds,
    fps: frontmatter.fps ?? config.render.fps,
    resolution:
      frontmatter.resolution ??
      `${config.render.width}x${config.render.height}`,
    theme,
    video_type: frontmatter.video_type ?? config.video.videoType,
    voiceover_mode: frontmatter.voiceover_mode ?? config.video.voiceoverMode,
    ...Object.fromEntries(
      (["cta", "website", "email", "phone", "address", "tagline"] as const).map(
        (key) => [key, frontmatter[key] ?? brand[key]],
      ),
    ),
  });
  if (!result.success)
    throw new Error(
      `Cannot resolve automation metadata for ${source.sourceName}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Configure missing brand/video defaults in automation.config.json.`,
    );
  return result.data;
}

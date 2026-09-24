import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseContent, loadContent } from "./load-content";
import { loadSource, type SourceDocument } from "./source-loader";
import {
  loadMetadataContext,
  firstH1,
  humanizeFilename,
  slugify,
} from "./resolve-metadata";
import { hash, readJson } from "./io";
import { CodexTestPlanner } from "./planner";

const markdown =
  "# SQL Server DDL\n\nData Definition Language commands define and modify database structures.\n\n## CREATE TABLE\n\n```sql\nCREATE TABLE employee (\n  id INT PRIMARY KEY,\n  name VARCHAR(100)\n);\n```\n";
const document = (
  content = markdown,
  name = "sqlserver-ddl.md",
): SourceDocument => ({
  type: "remote",
  originalReference: `https://example.com/${name}`,
  resolvedReference: `https://example.com/${name}`,
  sourceName: name,
  content,
  sourceHash: hash(content),
  fetchedAt: "2026-09-23T00:00:00.000Z",
});

test("no-frontmatter local Markdown resolves complete metadata without source changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "metadata-test-"));
  try {
    await writeFile(path.join(directory, "sqlserver-ddl.md"), markdown);
    const source = await loadSource("sqlserver-ddl.md", { root: directory });
    const content = parseContent(source);
    assert.deepEqual(content.frontmatter, {});
    assert.equal(content.body, markdown);
    assert.equal(content.metadata.title, "SQL Server DDL");
    assert.equal(content.metadata.slug, "sql-server-ddl");
    assert.equal(content.metadata.voiceover_mode, "auto");
    assert.equal(content.suppliedVoiceover, "");
    assert.equal(content.metadata.duration_mode, "auto");
assert.equal(content.metadata.duration_seconds, undefined);
    assert.equal(content.metadata.fps, 30);
    assert.equal(content.metadata.resolution, "1920x1080");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("no-frontmatter generic HTTPS and GitHub technical documents resolve identically", async () => {
  for (const reference of [
    "https://example.com/sqlserver-ddl.md",
    "https://github.com/u/r/blob/main/sqlserver-ddl.md",
    "https://raw.githubusercontent.com/u/r/main/sqlserver-ddl.md",
  ]) {
    const source = await loadSource(reference, {
      fetch: async () => new Response(markdown),
    });
    const content = parseContent(source);
    assert.equal(content.metadata.title, "SQL Server DDL");
    assert.equal(content.metadata.slug, "sql-server-ddl");
    assert.equal(content.metadata.voiceover_mode, "auto");
    assert.equal(content.sourceType, "remote");
    assert.equal(content.suppliedVoiceover, "");
  }
});
test("partial frontmatter overrides configured defaults while missing values resolve", () => {
  const context = loadMetadataContext();
  const raw =
    "---\ntitle: Database Structures\nslug: custom-ddl\nduration_seconds: 45\nfps: 24\nresolution: 1280x720\nvideo_type: tutorial\ntheme: corporate-clean-light\nbrand: Example Training\ncta: Start Learning\nvoiceover_mode: hybrid\n---\n" +
    markdown;
  const { metadata, frontmatter } = parseContent(document(raw), context);
  assert.equal(metadata.title, "Database Structures");
  assert.equal(metadata.slug, "custom-ddl");
  assert.equal(metadata.brand, "Example Training");
  assert.equal(metadata.cta, "Start Learning");
  assert.equal(metadata.duration_seconds, 45);
  assert.equal(metadata.fps, 24);
  assert.equal(metadata.resolution, "1280x720");
  assert.equal(metadata.theme, "corporate-clean-light");
  assert.equal(metadata.video_type, "tutorial");
  assert.equal(metadata.voiceover_mode, "hybrid");
  assert.equal(metadata.email, context.config.brand?.email);
  assert.equal(frontmatter.email, undefined);
});
test("title derives from H1 or humanized filename, ignoring headings inside code/comments", () => {
  assert.equal(
    firstH1("```md\n# Fake\n```\n<!--\n# Hidden\n-->\n# **SQL Server DDL**\n"),
    "SQL Server DDL",
  );
  assert.equal(firstH1("SQL Server DDL\n==============\n"), "SQL Server DDL");
  const content = parseContent(document("SQL commands create tables.\n"));
  assert.equal(content.metadata.title, "SQL Server DDL");
  assert.equal(content.metadata.slug, "sql-server-ddl");
  assert.equal(humanizeFilename("python-basics.md"), "Python Basics");
  assert.equal(
    humanizeFilename("aws-data-engineering.md"),
    "AWS Data Engineering",
  );
  assert.equal(slugify("SQL Server DDL"), "sql-server-ddl");
  assert.equal(slugify("../Café / Tables?"), "cafe-tables");
  assert.equal(slugify("CON"), "video-con");
  assert.equal(
    parseContent(document("# 数据库\n")).metadata.slug,
    "sql-server-ddl",
  );
  assert.throws(
    () => parseContent(document("---\nslug: ../../escape\n---\n" + markdown)),
    /invalid frontmatter/,
  );
  assert.throws(
    () => parseContent(document("---\nslug: con\n---\n" + markdown)),
    /reserved filesystem/,
  );
});
test("brand contacts and video defaults come from supplied configuration, not hardcoded course values", () => {
  const context = loadMetadataContext();
  context.config.brand = {
    name: "Example Academy",
    cta: "Read More",
    website: "example.org",
    email: "hello@example.org",
    phone: "+1 555 0100",
    address: "Example City",
    tagline: "Learn Every Day",
  };
  context.config.video = {
    durationMode: "fixed",
    durationSeconds: 60,
    videoType: "tutorial",
    theme: "ai-purple-gradient",
    voiceoverMode: "auto",
  };
  context.config.render = {
    ...context.config.render,
    fps: 24,
    width: 1280,
    height: 720,
  };
  const { metadata } = parseContent(document(), context);
  assert.equal(metadata.brand, "Example Academy");
  for (const key of [
    "cta",
    "website",
    "email",
    "phone",
    "address",
    "tagline",
  ] as const)
    assert.equal(metadata[key], context.config.brand[key]);
  assert.equal(metadata.duration_seconds, 60);
  assert.equal(metadata.video_type, "tutorial");
  assert.equal(metadata.theme, "ai-purple-gradient");
  assert.equal(metadata.fps, 24);
  assert.equal(metadata.resolution, "1280x720");
});
test("theme resolution respects source, config, active catalog and project fallback; unknown theme fails", () => {
  const context = loadMetadataContext();
  context.config.video.theme = "ai-purple-gradient";
  assert.equal(
    parseContent(document(), context).metadata.theme,
    "ai-purple-gradient",
  );
  assert.equal(
    parseContent(
      document("---\ntheme: cloud-orange\n---\n" + markdown),
      context,
    ).metadata.theme,
    "cloud-orange",
  );
  delete context.config.video.theme;
  context.themes.active = "corporate-clean-light";
  assert.equal(
    parseContent(document(), context).metadata.theme,
    "corporate-clean-light",
  );
  delete context.themes.active;
  assert.equal(
    parseContent(document(), context).metadata.theme,
    "tinitiate-dark-yellow",
  );
  assert.throws(
    () =>
      parseContent(
        document("---\ntheme: missing-theme\n---\n" + markdown),
        context,
      ),
    /Unknown theme/,
  );
  context.config.video.theme = "missing-default";
  assert.throws(() => parseContent(document(), context), /Unknown theme/);
});
test("only explicit supplied mode requires narration; ordinary prose and code never become supplied script", () => {
  assert.equal(parseContent(document()).suppliedVoiceover, "");
  assert.equal(
    parseContent(document("---\nvoiceover_mode: hybrid\n---\n" + markdown))
      .suppliedVoiceover,
    "",
  );
  assert.throws(
    () =>
      parseContent(document("---\nvoiceover_mode: supplied\n---\n" + markdown)),
    /requires an approved/,
  );
  const content = parseContent(
    document(
      "---\nvoiceover_mode: supplied\n---\n" +
        markdown +
        "\n## Voiceover\n\nLearn how to define database tables.\n",
    ),
  );
  assert.equal(
    content.suppliedVoiceover,
    "Learn how to define database tables.",
  );
});
test("untrusted frontmatter cannot override provider, secret, path or execution configuration", () => {
  const context = loadMetadataContext();
  const before = JSON.stringify(context);
  const raw =
    "---\ntitle: Normal Document\nOPENROUTER_API_KEY: fake-secret\nELEVENLABS_API_KEY: fake-tts\nplanner:\n  mode: malicious\n  endpoint: https://evil.example\ntts:\n  provider: malicious\nrender:\n  outputDir: ../../escape\noutputDir: ../../escape\nenv: malicious\ncommands: [erase]\nmodules: [evil]\ncomponent: ArbitraryReact\n---\n" +
    markdown;
  const content = parseContent(document(raw), context);
  assert.deepEqual(content.frontmatter, { title: "Normal Document" });
  assert.equal(JSON.stringify(context), before);
  assert.ok(!("OPENROUTER_API_KEY" in content.metadata));
  assert.ok(!("planner" in content.metadata));
  assert.equal(content.metadata.voiceover_mode, "auto");
});
test("full legacy ML frontmatter still passes the existing Codex VideoPlan validation", async () => {
  const context = loadMetadataContext();
  const content = await loadContent("inputs/ml-engineering.md", context);
  const stored = (await readJson("output/ml-engineering/metadata.json")) as {
    metadata: Record<string, unknown>;
  };
  for (const [key, value] of Object.entries(stored.metadata))
    assert.equal(content.metadata[key as keyof typeof content.metadata], value);
  assert.equal(content.metadata.theme, "future-neon-blue");
  assert.equal(content.metadata.voiceover_mode, "supplied");
  await new CodexTestPlanner().createVideoPlan({
    content,
    config: context.config,
    themeId: content.metadata.theme,
    theme: context.themes.themes[content.metadata.theme],
    planFile: "output/ml-engineering/video-plan.json",
  });
});
test("missing global brand defaults fail at resolution with an actionable configuration error", () => {
  const context = loadMetadataContext();
  delete context.config.brand;
  assert.throws(
    () => parseContent(document(), context),
    /Configure missing brand\/video defaults in automation.config.json/,
  );
});

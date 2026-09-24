import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { once } from "node:events";
import yazl from "yazl";
import { JobRepository } from "./repository";
import {
  extractSource,
  ingestLocal,
  ingestRemote,
  validateUpload,
} from "./ingestion";
import { readOffice } from "./ingestion/office";
import { safeDownload, MAX_SOURCE_BYTES } from "./ingestion/remote";
import {
  safeMessage,
  publicAddress,
  validateName,
  validateUrl,
} from "./security";
import {
  JobWorker,
  jobDirectory,
  sourceDirectory,
  engineAdapter,
} from "./worker";
import { createApp } from "./app";
import { save, readJson, hash } from "../automation/io";
import { videoPlanSchema } from "../automation/types";
import type { Job } from "./contracts";

const theme = "future-neon-blue";
function input(schedule: string | null = null) {
  return {
    sourceType: "MARKDOWN" as const,
    sourceLocationType: "REMOTE" as const,
    sourceReference: "https://example.com/course.md",
    sourceOriginalName: "course.md",
    sourceMimeType: "text/markdown",
    title: "Course",
    theme,
    durationMode: "auto" as const,
    scheduledAt: schedule,
  };
}
async function fixture() {
  const base = path.join(process.cwd(), ".verification");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "phase5-"));
  for (const name of ["automation.config.json", "themes.json"])
    await copyFile(name, path.join(root, name));
  const repo = new JobRepository(path.join(root, "jobs.sqlite"));
  return {
    root,
    repo,
    cleanup: async () => {
      repo.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
async function zip(files: Record<string, string>) {
  const archive = new yazl.ZipFile();
  for (const [name, value] of Object.entries(files))
    archive.addBuffer(Buffer.from(value), name);
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
const namespaces =
  'xmlns:w="urn:word" xmlns:a="urn:drawing" xmlns:p="urn:presentation" xmlns:r="urn:relationships"';
async function docx() {
  return zip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<w:document ${namespaces}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Architecture</w:t></w:r></w:p><w:p><w:r><w:t>Ordered paragraph.</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Bullet item</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Service</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>API</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    "word/media/image1.png": "image metadata fixture",
  });
}
async function pptx() {
  const slide = (title: string) =>
    `<p:sld ${namespaces}><p:sp><p:ph type="title"/><a:p><a:r><a:t>${title}</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Body bullet</a:t></a:r></a:p></p:sp></p:sld>`;
  return zip({
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": `<p:presentation ${namespaces}><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels":
      '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide10.xml"/></Relationships>',
    "ppt/slides/slide1.xml": slide("Final slide"),
    "ppt/slides/slide10.xml": slide("Opening slide"),
    "ppt/slides/_rels/slide10.xml.rels":
      '<Relationships><Relationship Type="test/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    "ppt/notesSlides/notesSlide1.xml": `<p:notes ${namespaces}><p:sp><p:ph type="body"/><a:p><a:r><a:t>Speaker explanation</a:t></a:r></a:p></p:sp></p:notes>`,
  });
}
function pdf(text = "Extracted page text") {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(value);
}

test("SQLite batches, persisted schedule, due selection, ordering and duplicate claims", async () => {
  const f = await fixture();
  try {
    const future = new Date(Date.now() + 60000).toISOString();
    const jobs = f.repo.createBatch([input(future), input(), input()]);
    assert.equal(jobs.length, 3);
    const second = new JobRepository(path.join(f.root, "jobs.sqlite"));
    assert.equal(second.get(jobs[0].id).scheduledAt, future);
    assert.equal(f.repo.claim()?.id, jobs[1].id);
    assert.equal(second.claim()?.id, jobs[2].id);
    assert.equal(f.repo.claim(), undefined);
    assert.equal(
      second.claim(new Date(Date.now() + 61000).toISOString())?.id,
      jobs[0].id,
    );
    second.close();
  } finally {
    await f.cleanup();
  }
});
test("failure, retry, cancel, reschedule and validation-gated completion", async () => {
  const f = await fixture();
  try {
    const [j] = f.repo.createBatch([input()]);
    f.repo.claim();
    assert.throws(() =>
      f.repo.complete(j.id, { valid: true, title: "bad", duration: 1 }),
    );
    assert.throws(() => f.repo.action(j.id, "cancel"), /unavailable/);
    f.repo.stage(j.id, "PLANNING");
    f.repo.fail(j.id, "Planner unavailable");
    assert.equal(f.repo.get(j.id).errorStage, "PLANNING");
    const reopened = new JobRepository(path.join(f.root, "jobs.sqlite"));
    assert.equal(reopened.get(j.id).errorMessage, "Planner unavailable");
    reopened.close();
    f.repo.action(j.id, "retry");
    f.repo.action(
      j.id,
      "reschedule",
      new Date(Date.now() + 50000).toISOString(),
    );
    assert.equal(f.repo.claim(), undefined);
    f.repo.action(j.id, "now");
    f.repo.claim();
    for (const s of [
      "PLANNING",
      "NARRATION_PREPARED",
      "GENERATING_VOICE",
      "ALIGNING_TIMING",
      "RENDERING",
      "VALIDATING",
    ])
      f.repo.stage(j.id, s);
    assert.throws(() =>
      f.repo.complete(j.id, { valid: false, title: "x", duration: 1 }),
    );
    f.repo.complete(j.id, { valid: true, title: "Validated", duration: 80 });
    assert.equal(f.repo.get(j.id).status, "COMPLETED");
    assert.equal(f.repo.get(j.id).attempt, 2);
    assert.throws(() => f.repo.action(j.id, "retry"));
    const [c] = f.repo.createBatch([input()]);
    f.repo.action(c.id, "cancel");
    assert.equal(f.repo.claim(), undefined);
    f.repo.action(c.id, "retry");
    assert.equal(f.repo.claim()?.id, c.id);
  } finally {
    await f.cleanup();
  }
});
test("crash recovery preserves jobs and marks interrupted attempts retryable", async () => {
  const f = await fixture();
  try {
    const [job] = f.repo.createBatch([input()]);
    f.repo.claim();
    f.repo.recover();
    assert.equal(f.repo.get(job.id).status, "FAILED");
    assert.match(f.repo.get(job.id).errorMessage!, /Retry/);
    f.repo.acquireServer();
    assert.throws(() => f.repo.acquireServer(), /Another UI server/);
    f.repo.releaseServer();
  } finally {
    await f.cleanup();
  }
});
test("Markdown loader reuse, UTF-8 text and common provenance contract", async () => {
  const f = await fixture();
  try {
    const b = Buffer.from("# Heading\r\n\r\nContent");
    const name = path.join(f.root, "lesson.md");
    await writeFile(name, b);
    const md = await ingestLocal(name, "lesson.md", f.root, b);
    assert.equal(md.content, "# Heading\n\nContent");
    const txt = await extractSource(
      Buffer.from("Plain lesson"),
      "lesson.txt",
      "TEXT",
    );
    for (const s of [md, txt]) {
      assert.ok(s.content);
      assert.ok(s.sections.length);
      assert.ok(s.provenance.reference);
      assert.ok(s.provenance.extractedAt);
      assert.ok(Array.isArray(s.provenance.assets));
    }
    assert.equal(md.title, "Heading");
    assert.throws(() => validateUpload("bad.txt", Buffer.from([0xff])));
  } finally {
    await f.cleanup();
  }
});
test("DOCX preserves heading, paragraph, list, table order and image metadata", async () => {
  const s = await extractSource(await docx(), "lesson.docx", "DOCX");
  assert.match(s.content, /# Architecture/);
  assert.match(s.content, /- Bullet item/);
  assert.match(s.content, /Service \| API/);
  assert.ok(
    s.content.indexOf("Ordered paragraph") < s.content.indexOf("Bullet item"),
  );
  assert.equal(s.provenance.assets.length, 1);
  assert.match(s.provenance.warnings[0], /not performed/);
});
test("PPTX follows presentation order, slide boundaries, bullets and speaker notes", async () => {
  const s = await extractSource(await pptx(), "lesson.pptx", "PPTX");
  assert.equal(s.provenance.slideCount, 2);
  assert.match(s.sections[0].heading, /Opening slide/);
  assert.match(s.sections[1].heading, /Final slide/);
  assert.match(s.sections[0].text, /Speaker explanation/);
  assert.match(s.sections[0].text, /- Body bullet/);
  assert.equal(s.sections[0].slide, 1);
});
test("PDF extracts page text and scanned or empty PDF fails with OCR guidance", async () => {
  const s = await extractSource(pdf(), "lesson.pdf", "PDF");
  assert.equal(s.provenance.pageCount, 1);
  assert.equal(s.sections[0].page, 1);
  assert.match(s.content, /Extracted page text/);
  await assert.rejects(extractSource(pdf(""), "scan.pdf", "PDF"), /OCR/);
  await assert.rejects(
    extractSource(Buffer.from("garbage"), "bad.pdf", "PDF"),
    /PDF/,
  );
});
test("webpage extraction keeps title/headings/content and removes scripts/navigation", async () => {
  const s = await extractSource(
    Buffer.from(
      "<html><head><title>Guide</title><script>secret()</script></head><body><nav>Noise</nav><main><h1>Topic</h1><p>Useful content</p><h2>Details</h2><pre>SELECT * FROM users</pre></main><footer>Repeated</footer></body></html>",
    ),
    "article",
    "WEBPAGE",
    "https://example.com/article",
  );
  assert.equal(s.title, "Guide");
  assert.match(s.content, /Useful content/);
  assert.match(s.content, /SELECT/);
  assert.doesNotMatch(s.content, /Noise|secret|Repeated/);
  assert.equal(s.provenance.reference, "https://example.com/article");
});
test("direct remote documents, GitHub Markdown and content-type mismatch", async () => {
  const p = await ingestRemote("https://example.com/a.pdf", async () => ({
    url: "https://example.com/a.pdf",
    mime: "application/pdf",
    bytes: pdf(),
  }));
  assert.equal(p.sourceType, "PDF");
  const md = await ingestRemote(
    "https://github.com/o/r/blob/main/a.md",
    async () => ({
      url: "https://raw.githubusercontent.com/o/r/main/a.md",
      mime: "text/plain",
      bytes: Buffer.from("# Remote\nContent"),
    }),
  );
  assert.equal(md.sourceType, "MARKDOWN");
  assert.match(md.provenance.reference, /github.com/);
  await assert.rejects(
    ingestRemote("https://example.com/a.pdf", async () => ({
      url: "https://example.com/a.pdf",
      mime: "text/html",
      bytes: Buffer.from("<html>bad</html>"),
    })),
    /content type/,
  );
});
test("local validation blocks traversal, wrong types, malformed archives and oversized sources", async () => {
  for (const name of ["../a.md", "C:\\a.md", "a/b.md", "..\\a.md"])
    assert.throws(() => validateName(name));
  assert.throws(() => validateUpload("a.exe", Buffer.from("MZ")));
  assert.throws(
    () => validateUpload("a.md", Buffer.alloc(MAX_SOURCE_BYTES + 1)),
    /20 MB/,
  );
  assert.throws(() => validateUpload("a.docx", Buffer.from("x")), /Office/);
  await assert.rejects(readOffice(Buffer.from("PKgarbage")), /Malformed/);
  await assert.rejects(
    extractSource(
      await zip({ "[Content_Types].xml": "<Types/>" }),
      "bad.docx",
      "DOCX",
    ),
    /missing/,
  );
  await assert.rejects(
    extractSource(
      await zip({
        "[Content_Types].xml": "<Types/>",
        "word/document.xml":
          "<!DOCTYPE doc [<!ENTITY secret SYSTEM 'file:///x'>]><doc/>",
      }),
      "entity.docx",
      "DOCX",
    ),
    /entity/,
  );
});
test("SSRF rejects loopback, private IPv4/IPv6, mapped IPv6, metadata and credentials without a request", async () => {
  for (const url of [
    "http://example.com/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://10.1.2.3/a",
    "https://192.168.1.1/a",
    "https://169.254.169.254/a",
    "https://[::1]/a",
    "https://[::ffff:127.0.0.1]/a",
    "https://user:pass@example.com/a",
    "https://example.com:444/a",
  ]) {
    assert.throws(() => validateUrl(url));
    await assert.rejects(safeDownload(url));
  }
  for (const ip of [
    "0.0.0.0",
    "100.64.0.1",
    "172.16.0.2",
    "fc00::1",
    "fe80::1",
    "224.0.0.1",
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("worker remains offline, honors pause, continues after failure and uses normalized content", async () => {
  const f = await fixture();
  try {
    const jobs = f.repo.createBatch([input(), input()]);
    for (const j of jobs)
      await save(
        path.join(sourceDirectory(f.root, j.id), "normalized.json"),
        await extractSource(
          Buffer.from("# Only normalized text"),
          "a.md",
          "MARKDOWN",
        ),
      );
    let calls = 0;
    const worker = new JobWorker(
      f.root,
      f.repo,
      async (j, s, stage) => {
        calls++;
        assert.match(s.content, /normalized text/);
        if (j.id === jobs[0].id) throw new Error("Fixture failure");
        for (const v of [
          "PLANNING",
          "GENERATING_VOICE",
          "ALIGNING_TIMING",
          "RENDERING",
          "VALIDATING",
        ])
          stage(v);
        return { valid: true, title: "Fixture", duration: 9 };
      },
      () => 1,
    );
    worker.tick();
    assert.equal(calls, 0);
    worker.paused = false;
    worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 5));
    assert.equal(f.repo.get(jobs[0].id).status, "FAILED");
    worker.tick();
    while (worker.active.size) await new Promise((r) => setTimeout(r, 5));
    assert.equal(f.repo.get(jobs[1].id).status, "COMPLETED");
    assert.equal(calls, 2);
  } finally {
    await f.cleanup();
  }
});
test("API batches, safe settings, mixed uploads, job actions and controlled ranged artifact delivery", async () => {
  const f = await fixture();
  const worker = new JobWorker(
    f.root,
    f.repo,
    async () => {
      throw new Error("No paid calls allowed");
    },
    () => 1,
    true,
  );
  const server = createApp(f.root, f.repo, worker).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const request = (route: string, body?: unknown) =>
    fetch(
      base + route,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
  try {
    const response = await request("/api/jobs/urls", {
      urls: ["https://example.com/a.md", "https://example.com/b.pdf"],
      options: { theme, durationMode: "auto" },
    });
    assert.equal(response.status, 201);
    const { jobs } = (await response.json()) as { jobs: Job[] };
    assert.equal(jobs.length, 2);
    assert.notEqual(jobs[0].id, jobs[1].id);
    const settings = await (await request("/api/settings")).text();
    assert.doesNotMatch(
      settings,
      /OPENROUTER_API_KEY|ELEVENLABS_API_KEY|C:\\\\|voiceId"/,
    );
    assert.match(settings, /plannerConfigured/);
    assert.equal(
      (
        await fetch(base + "/api/jobs", {
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(`/api/jobs/${jobs[0].id}/artifacts/video`)).status,
      404,
    );
    assert.equal((await request("/api/jobs/bad-id")).status, 404);
    const form = new FormData();
    form.append(
      "options",
      JSON.stringify({
        theme,
        durationMode: "auto",
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
      }),
    );
    for (const [name, buffer] of [
      ["a.md", Buffer.from("# Markdown")],
      ["b.txt", Buffer.from("Text")],
      ["c.docx", await docx()],
      ["d.pptx", await pptx()],
      ["e.pdf", pdf()],
    ] as [string, Buffer][])
      form.append("files", new Blob([new Uint8Array(buffer)]), name);
    const upload = await fetch(base + "/api/jobs/uploads", {
      method: "POST",
      body: form,
    });
    assert.equal(upload.status, 201, await upload.clone().text());
    const batch = (await upload.json()) as { jobs: Job[] };
    assert.equal(batch.jobs.length, 5);
    assert.equal(new Set(batch.jobs.map((j) => j.sourceType)).size, 5);
    assert.ok(batch.jobs.every((j) => j.status === "SCHEDULED"));
    const detail = await (
      await request(`/api/jobs/${batch.jobs[2].id}`)
    ).text();
    assert.match(detail, /Architecture/);
    assert.doesNotMatch(detail, /C:\\\\/);
    const invalid = new FormData();
    invalid.append("options", JSON.stringify({ theme }));
    invalid.append("files", new Blob(["MZ"]), "bad.exe");
    assert.equal(
      (
        await fetch(base + "/api/jobs/uploads", {
          method: "POST",
          body: invalid,
        })
      ).status,
      400,
    );
    assert.equal(
      (await request(`/api/jobs/${batch.jobs[0].id}/action`, { action: "now" }))
        .status,
      200,
    );
    const j = f.repo.claim()!;
    f.repo.stage(j.id, "VALIDATING");
    f.repo.complete(j.id, {
      valid: true,
      title: "Offline output fixture",
      duration: 2,
    });
    const dir = jobDirectory(f.root, j.id);
    await save(path.join(dir, "validation.json"), { valid: true });
    await save(path.join(dir, "renders", "final.mp4"), "0123456789");
    const output = await fetch(base + `/api/jobs/${j.id}/artifacts/video`, {
      headers: { Range: "bytes=2-5" },
    });
    assert.equal(output.status, 206, await output.clone().text());
    assert.equal(await output.text(), "2345");
    assert.equal(
      (await request(`/api/jobs/${j.id}/artifacts/env`)).status,
      404,
    );
    const download = await request(
      `/api/jobs/${j.id}/artifacts/video?download=1`,
    );
    assert.match(download.headers.get("content-disposition")!, /attachment/);
    assert.equal((await request("/api/worker", { paused: false })).status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.cleanup();
  }
});
test("safe errors redact configured secrets, bearer tokens and local paths", () => {
  const original = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "fixture-secret-123";
  try {
    const msg = safeMessage(
      new Error("fixture-secret-123 Bearer abc.def C:\\private\\config.env"),
    );
    assert.doesNotMatch(msg, /fixture-secret-123|abc.def|private/);
  } finally {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = original;
  }
});

test("engine adapter calls the existing runner with isolated output and narration-only voice input", async () => {
  const f = await fixture();
  try {
    const [job] = f.repo.createBatch([input()]);
    f.repo.claim();
    const source = await extractSource(
      Buffer.from("RAW DOCUMENT CONTENT MUST NOT BE SENT TO TTS"),
      "source.txt",
      "TEXT",
    );
    const baseline = videoPlanSchema.parse(
      await readJson("output/ml-engineering/video-plan.json"),
    );
    const samples = 8000;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(samples * 2, 40);
    const audioFile = path.join(f.root, "fixture.wav");
    await writeFile(audioFile, wav);
    const characters = [...baseline.voiceover.text];
    const hookEnd = baseline.scenes[0].voiceover.length + 1;
    const times = characters.map((_, i) =>
      i < hookEnd
        ? (i / hookEnd) * 0.8
        : 1.2 + ((i - hookEnd) / (characters.length - hookEnd)) * 24.8,
    );
    const pipeline = engineAdapter(f.root, {
      planner: {
        createVideoPlan: async ({ content, planFile }) => {
          assert.match(content.body, /RAW DOCUMENT/);
          const plan = {
            ...baseline,
            slug: content.metadata.slug,
            sourceHash: content.sourceHash,
            theme,
          };
          await save(planFile, plan);
          return plan;
        },
      },
      generateVoiceover: async (plan) => {
        assert.equal(plan.voiceover.text, baseline.voiceover.text);
        assert.doesNotMatch(plan.voiceover.text, /RAW DOCUMENT/);
        return {
          file: audioFile,
          duration: 26.1,
          cached: false,
          alignment: {
            characters,
            character_start_times_seconds: times,
            character_end_times_seconds: times.map((t) => t + 0.02),
          },
        };
      },
      renderVideo: async (_root, directory, props) => {
        assert.equal(props.plan.slug, `job-${job.id}`);
        const output = path.join(directory, "final.mp4");
        await save(output, "offline render fixture");
        await save(path.join(directory, "render-receipt.json"), {
          succeeded: true,
          outputHash: hash("offline render fixture"),
        });
        return output;
      },
      validateVideo: async () => ({
        valid: true,
        checks: { fixture: true },
        errors: [],
      }),
    });
    const result = await pipeline(job, source, (s) => f.repo.stage(job.id, s));
    f.repo.complete(job.id, result);
    assert.equal(f.repo.get(job.id).status, "COMPLETED");
    assert.equal(
      (
        (await readJson(
          path.join(jobDirectory(f.root, job.id), "audio-duration.json"),
        )) as { duration: number }
      ).duration,
      26.1,
    );
    assert.ok(
      f.repo
        .events(job.id)
        .some(
          (e) => e.stage === "NARRATION_PREPARED" && e.status === "COMPLETED",
        ),
    );
    await save(
      path.join(jobDirectory(f.root, job.id), "renders", "render-receipt.json"),
      { succeeded: false },
    );
  } finally {
    await f.cleanup();
  }
});

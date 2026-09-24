import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource, normalizeSource, resolveSourceUrl } from "./source-loader";
import { parseContent } from "./load-content";
import { parseQueue } from "./queue";
import { hash } from "./io";

test("local source, HTTPS and both GitHub URL forms have normalized content identity", async () => {
  const local = await loadSource("./inputs/ml-engineering.md");
  for (const reference of [
    "https://example.com/course.md",
    "https://raw.githubusercontent.com/owner/repo/main/course.md",
    "https://github.com/owner/repo/blob/main/course.md",
  ]) {
    const requests: string[] = [];
    const remote = await loadSource(reference, {
      fetch: async (url, options) => {
        requests.push(String(url));
        assert.deepEqual(options?.headers, {
          Accept: "text/markdown, text/plain;q=0.9",
        });
        assert.equal(options?.credentials, "omit");
        assert.equal(options?.redirect, "manual");
        return new Response("\uFEFF" + local.content.replace(/\n/g, "\r\n"));
      },
    });
    assert.equal(remote.sourceHash, local.sourceHash);
    assert.equal(remote.originalReference, reference);
    assert.equal(remote.type, "remote");
    assert.equal(remote.sourceName, "course.md");
    assert.ok(remote.fetchedAt);
    assert.equal(
      requests[0],
      reference.includes("github.com/")
        ? "https://raw.githubusercontent.com/owner/repo/main/course.md"
        : reference,
    );
    assert.equal(parseContent(remote).metadata.slug, "ml-engineering");
    const changed = await loadSource(reference, {
      fetch: async () => new Response(local.content + "\nChanged facts."),
    });
    assert.notEqual(remote.sourceHash, changed.sourceHash);
  }
  assert.equal(normalizeSource("\uFEFFa\r\nb\rc"), "a\nb\nc");
  assert.equal(
    resolveSourceUrl(
      "https://github.com/u/r/blob/feature/branch/path.md?raw=true",
    ).href,
    "https://raw.githubusercontent.com/u/r/feature/branch/path.md",
  );
});
test("remote loader rejects HTTP failures, empty responses, HTML and oversized streaming data", async () => {
  for (const [response, pattern] of [
    [new Response("missing", { status: 404 }), /HTTP 404/],
    [new Response("  \n"), /empty/],
    [new Response("<html>page</html>"), /HTML/],
    [
      new Response("page", { headers: { "content-type": "text/html" } }),
      /HTML/,
    ],
    [new Response("x", { headers: { "content-length": "999" } }), /exceeds/],
    [new Response("a".repeat(65)), /exceeds/],
  ] as const)
    await assert.rejects(
      loadSource("https://example.com/a.md", {
        maxBytes: 64,
        fetch: async () => response,
      }),
      pattern,
    );
});
test("redirect limits and HTTPS checks apply to every hop; timeout is useful", async () => {
  let calls = 0;
  const redirected = await loadSource("https://example.com/a.md", {
    fetch: async () =>
      ++calls === 1
        ? new Response(null, { status: 302, headers: { location: "/b.md" } })
        : new Response("# Course"),
  });
  assert.equal(redirected.resolvedReference, "https://example.com/b.md");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    loadSource("https://example.com/a.md", {
      maxRedirects: 2,
      fetch: async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "/loop.md" },
        });
      },
    }),
    /Too many/,
  );
  assert.equal(calls, 3);
  await assert.rejects(
    loadSource("https://example.com/a.md", {
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://example.com/plain.md" },
        }),
    }),
    /HTTPS/,
  );
  await assert.rejects(loadSource("http://example.com/a.md"), /HTTPS/);
  await assert.rejects(
    loadSource("https://user:password@example.com/a.md"),
    /credentials/,
  );
  await assert.rejects(loadSource("https://github.com/u/r/tree/main"), /blob/);
  await assert.rejects(
    loadSource("https://example.com/a.md", {
      timeoutMs: 10,
      fetch: async (_url, options) =>
        new Promise((_resolve, reject) => {
          // Keep the fake connection alive while the unref'ed abort timer fires.
          const timer = setTimeout(
            () => reject(new Error("test timeout")),
            1000,
          );
          options?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    }),
    /timed out/,
  );
});
test("queue preserves mixed references and legacy/extended completion comments", () => {
  const rows = parseQueue(
    `# Videos\n\n* ./inputs/a.md\n* https://example.com/content?format=md\n* https://github.com/u/r/blob/main/a.md <!-- done -->\n* https://raw.githubusercontent.com/u/r/main/b.md <!-- done source-sha256:${"a".repeat(64)} -->\n`,
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((i) => i.done),
    [false, false, true, true],
  );
  assert.equal(rows[1].source, "https://example.com/content?format=md");
});
test("narration defaults to auto; supplied requires an explicit script; executable frontmatter is rejected", async () => {
  const source = await loadSource("inputs/ml-engineering.md");
  const auto = source.content.replace("voiceover_mode: supplied\n", "");
  assert.equal(
    parseContent({ ...source, content: auto, sourceHash: hash(auto) }).metadata
      .voiceover_mode,
    "auto",
  );
  const hybrid = source.content.replace(
    "voiceover_mode: supplied",
    "voiceover_mode: hybrid",
  );
  assert.equal(
    parseContent({ ...source, content: hybrid }).metadata.voiceover_mode,
    "hybrid",
  );
  const missing = source.content.replace(
    "## Continuous ElevenLabs Voice-Over Text",
    "## Unapproved notes",
  );
  assert.throws(
    () => parseContent({ ...source, content: missing }),
    /requires an approved/,
  );
  assert.throws(
    () =>
      parseContent({
        ...source,
        content: "---javascript\nthrow new Error('executed')\n---\n",
      }),
    /Only YAML/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenRouterPlanner } from "./planner-openrouter";
import { loadContent } from "./load-content";
import { readJson, hash } from "./io";
import {
  configSchema,
  themeSchema,
  videoPlanSchema,
  type VideoPlan,
} from "./types";
import type { PlannerInput } from "./planner";
import { buildPlannerMessages, plannerJsonSchema } from "./planner-prompt";
import { assertNarration, narrationBudget } from "./narration";
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openrouter-test-"));
  const content = await loadContent("inputs/ml-engineering.md");
  const config = configSchema.parse(await readJson("automation.config.json"));
  const catalog = (await readJson("themes.json")) as {
    themes: Record<string, unknown>;
  };
  const plan = videoPlanSchema.parse(
    await readJson("output/ml-engineering/video-plan.json"),
  );
  plan.fullVoiceover = plan.voiceover.text;
  const input: PlannerInput = {
    content,
    config,
    themeId: plan.theme,
    theme: themeSchema.parse(catalog.themes[plan.theme]),
    planFile: path.join(directory, "video-plan.json"),
  };
  return {
    directory,
    input,
    plan,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
const completion = (plan: unknown, usage = false) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: typeof plan === "string" ? plan : JSON.stringify(plan),
          },
          finish_reason: "stop",
        },
      ],
      ...(usage
        ? {
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
              total_tokens: 300,
            },
          }
        : {}),
    }),
  );
test("structured request contains only planning context; valid plan and usage are cached", async () => {
  const f = await fixture();
  let calls = 0;
  try {
    const planner = new OpenRouterPlanner({
      apiKey: () => "test-openrouter-secret",
      fetch: async (url, options) => {
        calls++;
        assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
        assert.equal(options?.redirect, "error");
        assert.equal(
          new Headers(options?.headers).get("authorization"),
          "Bearer test-openrouter-secret",
        );
        const body = JSON.parse(String(options?.body));
        assert.equal(body.model, f.input.config.planner.openrouterModel);
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.provider.require_parameters, true);
        assert.ok(!JSON.stringify(body).includes("test-openrouter-secret"));
        assert.match(body.messages[0].content, /UNTRUSTED REFERENCE/);
        assert.match(body.messages[0].content, /Never write React/);
        return completion(f.plan, true);
      },
    });
    await planner.createVideoPlan(f.input);
    await planner.createVideoPlan(f.input);
    assert.equal(calls, 1);
    assert.equal(planner.metadata?.totalTokens, 300);
    const cached = await new OpenRouterPlanner({
      apiKey: () => undefined,
      fetch: async () => {
        throw new Error("must not call");
      },
    }).createVideoPlan(f.input);
    assert.equal(cached.fullVoiceover, f.plan.voiceover.text);
    assert.ok(
      !(
        await readFile(path.join(f.directory, "planner-cache.json"), "utf8")
      ).includes("test-openrouter-secret"),
    );
    const schema = plannerJsonSchema();
    assert.ok(schema.required?.includes("fullVoiceover"));
    const messages = buildPlannerMessages(f.input);
    assert.equal(JSON.parse(messages[1].content).narrationMode, "supplied");
  } finally {
    await f.cleanup();
  }
});
test("planner cache invalidates content, model, theme, video settings, schema fingerprint and tampered plan", async () => {
  const f = await fixture();
  let calls = 0;
  let current = f.input;
  const planner = new OpenRouterPlanner({
    apiKey: () => "test-secret",
    fetch: async () => {
      calls++;
      return completion({ ...f.plan, sourceHash: current.content.sourceHash });
    },
  });
  try {
    await planner.createVideoPlan(current);
    current = {
      ...current,
      content: {
        ...current.content,
        sourceHash: hash("changed"),
        body: current.content.body + "\nNew facts",
      },
    };
    await planner.createVideoPlan(current);
    current = {
      ...current,
      config: {
        ...current.config,
        planner: {
          ...current.config.planner,
          openrouterModel: "another/model",
        },
      },
    };
    await planner.createVideoPlan(current);
    current = { ...current, theme: { ...current.theme, primary: "#ffffff" } };
    await planner.createVideoPlan(current);
    current = {
      ...current,
      config: {
        ...current.config,
        render: { ...current.config.render, fps: 60 },
      },
    };
    await planner.createVideoPlan(current);
    const cacheFile = path.join(f.directory, "planner-cache.json");
    const cache = (await readJson(cacheFile)) as Record<string, unknown>;
    await writeFile(
      cacheFile,
      JSON.stringify({ ...cache, fingerprint: "old-schema-version" }),
    );
    await planner.createVideoPlan(current);
    await writeFile(current.planFile, "{}");
    await planner.createVideoPlan(current);
    assert.equal(calls, 7);
  } finally {
    await f.cleanup();
  }
});
test("transient statuses retry three times with exponential backoff; auth and malformed plans do not retry", async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const f = await fixture();
    let calls = 0;
    const waits: number[] = [];
    try {
      const planner = new OpenRouterPlanner({
        apiKey: () => "test-secret",
        sleep: async (ms) => {
          waits.push(ms);
        },
        fetch: async () => {
          calls++;
          return new Response(null, { status });
        },
      });
      await assert.rejects(
        planner.createVideoPlan(f.input),
        new RegExp(`HTTP ${status}`),
      );
      assert.equal(calls, 3);
      assert.deepEqual(waits, [500, 1000]);
    } finally {
      await f.cleanup();
    }
  }
  for (const status of [400, 401, 403]) {
    const f = await fixture();
    let calls = 0;
    try {
      await assert.rejects(
        new OpenRouterPlanner({
          apiKey: () => "test-secret",
          fetch: async () => {
            calls++;
            return new Response("auth test-secret", { status });
          },
        }).createVideoPlan(f.input),
        (error) => {
          assert.match(String(error), new RegExp(`HTTP ${status}`));
          assert.ok(!String(error).includes("test-secret"));
          return true;
        },
      );
      assert.equal(calls, 1);
    } finally {
      await f.cleanup();
    }
  }
});
test("invalid JSON, scene type, frame count, theme and supplied narration cannot be saved", async () => {
  const f = await fixture();
  try {
    const invalid: unknown[] = [
      "```json\n{}\n```",
      { ...f.plan, totalFrames: 899 },
      { ...f.plan, theme: "wrong" },
      {
        ...f.plan,
        scenes: f.plan.scenes.map((s, i) =>
          i === 0 ? { ...s, type: "arbitrary-react" } : s,
        ),
      },
      { ...f.plan, fullVoiceover: "different" },
    ];
    for (const plan of invalid) {
      let calls = 0;
      await assert.rejects(
        new OpenRouterPlanner({
          apiKey: () => "test-secret",
          fetch: async () => {
            calls++;
            return completion(plan);
          },
        }).createVideoPlan(f.input),
      );
      assert.equal(calls, 1);
    }
    await assert.rejects(readFile(f.input.planFile));
  } finally {
    await f.cleanup();
  }
});
test("network timeouts are bounded and valid responses without usage work", async () => {
  const f = await fixture();
  let calls = 0;
  const waits: number[] = [];
  try {
    const planner = new OpenRouterPlanner({
      apiKey: () => "test-secret",
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetch: async () => {
        if (++calls < 3) throw new DOMException("timeout", "TimeoutError");
        return completion(f.plan);
      },
    });
    await planner.createVideoPlan(f.input);
    assert.equal(calls, 3);
    assert.deepEqual(waits, [500, 1000]);
    assert.equal(planner.metadata?.totalTokens, undefined);
  } finally {
    await f.cleanup();
  }
});
test("supplied narration over budget fails before any request; auto and hybrid may shorten once", async () => {
  const f = await fixture();
  try {
    const longText = Array(100).fill("Learning").join(" ");
    await assert.rejects(
      new OpenRouterPlanner({
        apiKey: () => "test-secret",
        fetch: async () => {
          throw new Error("must not call");
        },
      }).createVideoPlan({
        ...f.input,
        content: { ...f.input.content, suppliedVoiceover: longText },
      }),
      /approved shorter/,
    );
    for (const mode of ["auto", "hybrid"] as const) {
      let calls = 0;
      const input = {
        ...f.input,
        planFile: path.join(f.directory, mode, "video-plan.json"),
        content: {
          ...f.input.content,
          metadata: { ...f.input.content.metadata, voiceover_mode: mode },
        },
      };
      const longPlan: VideoPlan = {
        ...f.plan,
        scenes: f.plan.scenes.map((s) => ({ ...s, voiceover: longText })),
      };
      longPlan.voiceover = {
        ...longPlan.voiceover,
        text: longPlan.scenes.map((s) => s.voiceover).join(" "),
      };
      longPlan.fullVoiceover = longPlan.voiceover.text;
      const planner = new OpenRouterPlanner({
        apiKey: () => "test-secret",
        fetch: async () => completion(++calls === 1 ? longPlan : f.plan),
      });
      await planner.createVideoPlan(input);
      assert.equal(calls, 2);
    }
    assert.ok(narrationBudget(f.plan.voiceover.text, 30, f.input.config).fits);
    assert.ok(!narrationBudget(f.plan.voiceover.text, 10, f.input.config).fits);
    for (const text of [
      "```python\nimport example\n```",
      "docker run -p 8000:8000 app",
      "# Introduction",
      "https://example.com/long/path",
      "| name | value |",
    ]) {
      assert.throws(
        () => assertNarration(text, 30, f.input.config, "auto"),
        /raw Markdown/,
      );
    }
  } finally {
    await f.cleanup();
  }
});


test("external narration planning never sends the user script and returns a visual-only plan", async () => {
  const f = await fixture();
  const externalPlan = {
    ...f.plan,
    narrationExternal: true,
    fullVoiceover: "",
    voiceover: { mode: "continuous" as const, text: "" },
    scenes: f.plan.scenes.map((scene) => ({ ...scene, voiceover: "" })),
  };
  try {
    const planner = new OpenRouterPlanner({
      apiKey: () => "test-openrouter-secret",
      fetch: async (_url, options) => {
        const body = JSON.stringify(options?.body);
        assert.ok(!body.includes("Secret supplied script"));
        const messages = JSON.parse(String(options?.body)).messages;
        assert.ok(!JSON.stringify(messages).includes("Secret supplied script"));
        return completion(externalPlan);
      },
    });
    const result = await planner.createVideoPlan({
      ...f.input,
      hybrid: {
        visualSource: "AI",
        narrationSource: "USER_SCRIPT",
      },
    });
    assert.equal(result.narrationExternal, true);
    assert.equal(result.voiceover.text, "");
  } finally {
    await f.cleanup();
  }
});

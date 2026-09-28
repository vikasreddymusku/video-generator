import { readFile } from "node:fs/promises";
import type { AutomationConfig } from "./types";
import { probe } from "./media";

type VideoAnalysis = {
  title?: string;
  narration: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
};

const responseSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    narration: { type: "string" },
  },
  required: ["title", "narration"],
  additionalProperties: false,
};

function mediaType(file: string) {
  return file.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
}

function parseJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\\s*/i, "")
    .replace(/\\s*```$/i, "");
  return JSON.parse(cleaned) as { title?: unknown; narration?: unknown };
}

export async function analyzeUserVideo(
  file: string,
  config: AutomationConfig,
  dependencies: { fetch?: typeof fetch; apiKey?: () => string | undefined } = {},
): Promise<VideoAnalysis> {
  const metadata = await probe(file);
  const key = dependencies.apiKey
    ? dependencies.apiKey()
    : process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OpenRouter selected for video narration but OPENROUTER_API_KEY is missing.");
  }

  const bytes = await readFile(file);
  const dataUrl = "data:" + mediaType(file) + ";base64," + bytes.toString("base64");
  const response = await (dependencies.fetch ?? fetch)(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.planner.videoModel,
        max_tokens: Math.min(config.planner.maxTokens, 2000),
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "Analyze the supplied technical video and generate only the missing narration. The supplied video is authoritative: never propose replacement visuals. Describe only what is actually visible or clearly audible. Do not invent facts, metrics, products, people, or claims. Return one JSON object with title and natural spoken narration. Do not use Markdown fences.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  task:
                    "Write a concise, professional narration for the entire uploaded video. Preserve the video subject and sequence. The narration will be sent to ElevenLabs exactly as returned.",
                  durationSeconds: Number(metadata.format.duration),
                  videoWidth: metadata.streams.find((stream) => stream.codec_type === "video")?.width,
                  videoHeight: metadata.streams.find((stream) => stream.codec_type === "video")?.height,
                }),
              },
              {
                type: "video_url",
                video_url: { url: dataUrl },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "VideoNarration",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(config.planner.timeoutMs),
    },
  );

  if (!response.ok) {
    const detail = (await response.text())
      .slice(0, 1200)
      .split(key)
      .join("[REDACTED]");
    throw new Error(
      "OpenRouter video analysis failed (HTTP " +
        response.status +
        "): " +
        detail,
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenRouter video analysis returned no narration.");
  const parsed = parseJson(raw);
  const narration = typeof parsed.narration === "string" ? parsed.narration.trim() : "";
  if (!narration) throw new Error("OpenRouter video analysis returned an empty narration.");

  const videoStream = metadata.streams.find((stream) => stream.codec_type === "video");
  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : undefined,
    narration,
    durationSeconds: Number(metadata.format.duration),
    width: videoStream?.width,
    height: videoStream?.height,
    hasAudio: metadata.streams.some((stream) => stream.codec_type === "audio"),
  };
}
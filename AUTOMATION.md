# Markdown-to-video automation

The queue is `video-source.md`. Each pending Markdown bullet is processed in order; only a validated narrated MP4 is marked `<!-- done -->`. Source files contain content and branding, while provider configuration stays in `automation.config.json` and secrets stay in `.env`.

## Phase 2: runtime planning

`automation.config.json` now selects `planner.mode: "openrouter"` and model `openai/gpt-5.6-sol`. The existing ElevenLabs, Remotion, audio cache, render cache, and output validator remain the downstream pipeline. No live Phase 2 API call has been made during implementation.

After approval, `npm run videos` processes pending queue entries and can spend both OpenRouter and ElevenLabs credits. It does not require Codex interaction or `--allow-tts` in OpenRouter mode. Keep all API keys in `.env`.

Supported queue references include local Markdown, generic HTTPS Markdown, GitHub `/OWNER/REPO/blob/REF/PATH.md`, and `raw.githubusercontent.com` URLs. The frontmatter contract (title, slug, brand, duration, video type, and CTA/contact details) still applies. A plain Markdown file without the required frontmatter fails with a useful error.

Remote loading uses a 20-second total timeout, a 2 MiB limit checked while streaming, and at most five redirects. Every hop must remain HTTPS without URL credentials. HTML, empty bodies, invalid UTF-8, and HTTP failures are rejected. GitHub blob URLs resolve to raw Markdown before fetching. Sources receive no provider authorization headers. Frontmatter accepts YAML only; executable frontmatter engines are rejected.

Content is normalized by removing a leading UTF-8 BOM and converting CRLF/CR to LF; other content and whitespace remain intact. SHA-256 is computed over those normalized UTF-8 bytes. `source.md` stores the same normalized snapshot. `metadata.json` includes original/resolved references, source type, hash, and fetch time. Pending URLs are fetched again on each run, so changed content at the same URL invalidates planning. Completed queue entries remain skipped unless explicitly forced; both `<!-- done -->` and `<!-- done source-sha256:HASH -->` are recognized.

## First paid planner test (only after approval)

```sh
npm run video:url -- ./inputs/ml-engineering.md --plan-only --output-dir output/openrouter-test
```

This standalone planning-only command uses the current source but writes to an isolated output directory, preserving the completed ML video. It calls OpenRouter on a cache miss and never calls ElevenLabs, renders video, or edits the queue. To test a remote source, replace the local path with its HTTPS Markdown URL. No example URL is fetched automatically.

`npm run video:url -- "https://example.com/course.md"` uses the exact same full pipeline for one source, independently of the queue. `--plan-only` is the safe way to limit it to source loading and potentially paid planning. `--output-dir` selects an output base within the workspace.

## Preview without paid calls

```sh
npm run video:preview
npm run dev
```

Open `MLEngineeringPromo` in Studio. Preview preparation checks the source fingerprint and schema, extracts metadata, preserves the supplied narration, and refreshes `src/generated/preview.json`. It does not load narration or call either provider. The preview JSON is a browser-safe snapshot of the plan and theme, with no environment configuration. The `DynamicVideo` composition accepts the same props for any future course.

## After explicit approval to generate narration

```sh
npm run video:test -- --allow-tts
```

This is the command that can spend ElevenLabs credits. It loads `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` from `.env`, uses the configured model, generates continuous narration with character timestamps, measures the MP3 locally using bundled ffprobe, and aligns scene boundaries. Audio is never accelerated. Narration must finish at least 0.15 seconds before the end; invalid or overlong audio is preserved for review and the queue remains pending.

`npm run video:test` keeps Codex test mode: without `--allow-tts` it can reuse valid cached audio but cannot generate new speech. `--force` includes completed entries and rerenders; it does not bypass valid planner or TTS caches. `--theme <id>` selects a theme override, causing OpenRouter to replan or Codex test mode to require a correspondingly reviewed plan. Preview and validation modes always use an existing plan and cannot trigger OpenRouter.

## Planning and resume

OpenRouter implements the existing `Planner` interface and chooses only the seven scene types already supported by `DynamicVideo`. It produces data, never JSX. New plans include `fullVoiceover` equal to `voiceover.text` and scene narration joined in order. Phase 1 plans without that alias still validate.

Strict JSON Schema output is enabled by default, derived from the existing Zod schema, with provider `require_parameters: true`. Local Zod validation additionally checks frame arithmetic, scene continuity, narration correspondence, source identity, theme, dimensions and exact contact details. Unsupported model/provider settings fail clearly; there is no automatic downgrade or model substitution. Set `planner.structuredOutput: false` only intentionally for JSON-object mode; local validation remains mandatory. Model/endpoint availability and live schema compatibility await the first approved API test.

The prompt treats Markdown as untrusted reference material, explains narration/code/table/list/URL handling, and includes the selected theme, parsed frontmatter, exact video constraints, supported scenes, schema and relevant planning rules distilled from `skills.md`. It does not send environment contents or unrelated source code.

Planner caching uses the normalized source hash, theme definition, model/settings, prompt/schema version and actual schema/messages, video settings, and narration budget settings. A matching `planner-cache.json`, valid plan and matching plan hash are required for reuse. Changed content/model/theme/schema invalidates the cache. Planner metadata records provider/model, source hash, plan hash, theme, generation time and optional token usage. Invalid plans never replace successful cached plans. Bounded retries cover transient HTTP 429/500/502/503/504 and network failures with 0.5/1-second backoff, at most three transport attempts per request. HTTP 400/401/403, malformed JSON, and invalid schemas fail immediately.

Codex debugging remains available via `--codex-test`; changed content requires a reviewed plan. Legacy plans hashed from CRLF bytes may need a one-time hash refresh to the normalized source identity. Existing LF-hashed ML artifacts continue to validate unchanged.

## Narration modes and pre-TTS budget

Frontmatter `voiceover_mode` defaults to `auto`: write dedicated spoken narration from the source. `supplied` preserves the explicitly approved narration exactly; use `## Continuous ElevenLabs Voice-Over Text`, `## Voice-Over Text`, or `## Voiceover` for that script. `hybrid` permits polishing/shortening supplied guidance while preserving facts.

The narration target scales from 50–60 words per 30 seconds. Estimated duration is `words / wordsPerMinute * 60 + pauseBufferSeconds * duration / 30`, and must fit within `duration - endingBufferSeconds`. Defaults are 150 WPM, a two-second pause allowance per 30 seconds, and a 0.5-second ending buffer. Raw Markdown/code/command/URL narration is rejected. Over-budget supplied narration fails before any planner/TTS call and requires an approved shorter script. An otherwise valid over-budget auto/hybrid plan may receive one OpenRouter shortening pass; if still too long, it stops before TTS. Including transient retries, planning is bounded to six transport attempts across the initial request and optional shortening request.

`voiceover.txt` is written and read back before the unchanged TTS adapter receives only its narration text. The existing post-TTS ffprobe measurement remains authoritative and rejects audio that cannot fit without acceleration. Estimates cannot guarantee the actual speaking duration. `narration-budget.json` records the pre-TTS check.

Outputs include `source.md`, extracted `metadata.json`, `voiceover.txt`, `audio/voiceover.mp3`, `audio/cache.json`, timestamp-adjusted `render-plan.json`, `renders/final.mp4`, `renders/poster.png`, `renders/render-receipt.json`, `validation.json`, and `logs/run.log`. The authored plan remains intact; measured timings live in the render plan.

TTS cache keys include text, voice, model, format, and settings, and cached bytes must pass both a hash check and audio probing. Render caching includes props, audio bytes, source code, and package lock; a matching receipt and valid MP4 are required. Rendering uses a temporary output, validates it, and only then replaces the final output. Optional audio files in `public/audio/` are probed and omitted if missing or invalid.

`npm run video:validate` verifies an existing final output and its render receipt without changing the queue. Validation cannot be disabled for queue completion. A local exclusive lock prevents overlapping runners; after an abrupt crash, verify the previous process has stopped before removing `output/.automation.lock`.

## Checks

```sh
npx tsc --noEmit
npm run lint
npm run test:automation
```

On PowerShell installations that block `.ps1` shims, use `npm.cmd` and `npx.cmd`.

API references: [ElevenLabs speech with timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), [Remotion Node rendering](https://www.remotion.dev/docs/renderer).

Phase 2 references: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Zod JSON Schema conversion](https://zod.dev/json-schema).

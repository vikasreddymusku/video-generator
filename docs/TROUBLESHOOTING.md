# Troubleshooting

## The page loads, but jobs do not run

Open **Settings** and check the worker indicator. The worker starts paused by default. Press **Start worker**. If the server was started with `ui:offline`, it is intentionally unable to run jobs.

## The worker will not start

Offline mode rejects worker start by design. Restart with `npm.cmd run ui` for a real local worker. Starting a real worker with eligible jobs can call configured providers and may incur charges.

## Provider configuration is missing

AI planning needs `OPENROUTER_API_KEY`. TTS needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` or a configured voice ID. Check the Settings status indicators. Preview, plan-only, validation-only, and tests can be used without making the corresponding paid call.

## A source upload is rejected

Check the extension and file contents:

- Markdown/text must be UTF-8 and must not be binary or HTML.
- PDFs must be real PDFs and contain extractable text.
- DOCX/PPTX must be real Office ZIP documents.
- The ordinary source limit is 20 MB.
- PPTX and DOCX images are not OCR’d; provide readable text if the visual content is important.

## A URL is rejected

Sources must use HTTPS on port 443 without a username or password. Local, private, metadata, and test domains are blocked. Redirects must remain acceptable HTTPS destinations. Remote downloads are bounded by timeout, redirect count, and size.

## A hybrid job says a required input is missing

Check the selected combination:

- AI visuals need a source file or URL.
- User video needs a readable `.mp4`, `.webm`, or `.mov`.
- User script cannot be empty.
- User audio needs a readable supported audio file.
- AI-generated narration needs a narration viewpoint.

The server repeats these checks even if the browser already showed the fields.

## User script is too long for a fixed duration

This is intentional. The tool will not silently rewrite an exact user script. Either choose auto duration so the plan can grow, or provide a shorter approved script.

## User audio does not fit

In auto mode, the visual timeline can grow to fit the audio plus the ending buffer. In fixed mode, audio that exceeds the available time is rejected. The tool never speeds up supplied audio.

## User video does not render

Confirm the file has a readable video stream and uses `.mp4`, `.webm`, or `.mov`. The current user-video scene uses a cover fit, so unusual aspect ratios may crop content at the edges. Arbitrary crop controls are not currently available.

## The planner rejects a plan

The planner must return one JSON object using the existing schema and scene types. Common causes are invalid frame arithmetic, missing technical payloads, invented code or metrics, a wrong source hash, unsupported composition ID, or narration that is not spoken text. A stale cache is discarded rather than trusted.

## The render exists but the job is not completed

Completion is gated by validation. Check `validation.json` and the job stage. The validator checks dimensions, FPS, duration tolerance, frame count, playable video, audio stream, voiceover fit, and the render receipt. A file that exists but fails any check is not a completed result.

## A previous run left a lock

The CLI uses `output/.automation.lock` to prevent overlapping renderer runs. Confirm no automation process is still running, then remove the lock only if it is stale. Do not delete it while an active run is using the shared output.

## A failed job is safe to retry

Use **Retry** in the UI after correcting the cause. Managed source snapshots and cached artifacts remain available. Remote URLs may be fetched again, so a remote source can produce a different source hash if its content changed.

## What the current tool does not do

The current implementation does not provide OCR for embedded Office images, automatic transcription of user audio, arbitrary nonlinear editing, caption generation, cloud storage, or multi-user access control. Treat those as future extensions rather than configuration options.


# Tinitiate Video Studio — start here

Tinitiate Video Studio turns Markdown, text, PDF, Word, PowerPoint, and safe HTTPS/web sources into narrated technical MP4s. Every source becomes its own persistent job and uses the existing pipeline:

`source ingestion → OpenRouter plan → ElevenLabs narration → actual audio timing → Remotion → validation → MP4`

## Start the local UI

Install dependencies once:

```powershell
npm.cmd install
```

Build and start the local application:

```powershell
npm.cmd run ui
```

Open [http://localhost:3100](http://localhost:3100).

The worker starts paused by default. You can safely browse the UI, add scheduled jobs, upload sources, and inspect the queue without calling OpenRouter or ElevenLabs.

For a fully offline UI verification server that cannot execute jobs:

```powershell
npm.cmd run ui:offline
```

## First real production video

Before running a production job, add these values to the root `.env` file:

```env
OPENROUTER_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

Then:

1. Run `npm.cmd run ui` and open `http://localhost:3100`.
2. Go to **Create Video**, add an HTTPS source or upload a supported file.
3. Choose **Generate now**, then create the job.
4. Open **Settings** and press **Start worker**.

Pressing **Start worker** with an eligible queued job is the exact action that begins the first real paid OpenRouter and ElevenLabs generation. It will use the configured provider credentials and may incur charges.

## Supported inputs

- Local files: `.md`, `.txt`, `.pdf`, `.docx`, `.pptx`
- HTTPS: Markdown, TXT, direct PDF/DOCX/PPTX links, GitHub Markdown URLs, and readable webpages

Uploads are copied to managed job storage. Remote sources use HTTPS, redirect, size, content-type, DNS, and private-network restrictions. PDF, Word, and PowerPoint files are text-extracted before planning; raw document data is never sent to ElevenLabs.

## Job workflow

- **Dashboard** gives a live operational overview.
- **Create Video** creates one independent job per source, including mixed batches.
- **Job Queue** separates pending work from validated completed videos.
- **Scheduler** manages due times, rescheduling, immediate runs, and cancellation.
- **Completed Videos** contains only outputs that passed validation.
- **Job detail** retains source provenance, plan, narration, stage events, safe error messages, and controlled preview/download links.

Jobs and events live in `data/jobs.sqlite`; managed uploads live in `inputs/job-uploads`; job outputs live in `output/jobs`. Do not edit these while the local server is running.

## Existing CLI compatibility

The existing Markdown CLI workflow remains available:

```powershell
npm.cmd run videos
npm.cmd run videos -- --plan-only
```

See [AUTOMATION.md](AUTOMATION.md) for its source, caching, narration, and rendering details.

## Verification commands

```powershell
npm.cmd run test:automation
npm.cmd run test:phase5
npm.cmd run test:ui
npm.cmd run lint
npm.cmd run build:ui
```

The test suites use fixtures, mocked provider calls, and offline servers. They do not call OpenRouter or ElevenLabs.

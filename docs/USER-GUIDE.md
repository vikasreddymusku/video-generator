# User Guide

This guide is for someone using Tinitiate Video Studio locally without needing to understand the implementation.

## 1. Start the app safely

From `C:\Code\tinitiate-video-phase7`:

```powershell
npm.cmd install
npm.cmd run ui
```

Open `http://localhost:3100` in the browser. The worker is paused by default. You can create jobs and inspect the application without provider calls.

For interface-only verification:

```powershell
npm.cmd run ui:offline
```

Offline mode cannot run jobs and does not allow the worker to start.

## 2. Prepare provider settings

Real generation needs these values in the repository’s `.env` file:

```env
OPENROUTER_API_KEY=your-openrouter-key
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=your-voice-id
```

Keep the file private. The Settings page shows whether the provider values are configured, but it does not display the secrets.

## 3. Create a normal video

1. Select **Create Video**.
2. Keep the standard source mode.
3. Upload `.md`, `.txt`, `.pdf`, `.docx`, or `.pptx`, or paste one or more HTTPS source URLs.
4. Choose a theme.
5. Choose **Auto** duration or **Fixed** duration.
6. Choose **Generate now** or schedule a future time.
7. Select **Create video jobs**.

One source creates one independent job. Multiple uploads create separate jobs rather than merging their content.

## 4. Create a hybrid video

Select **Hybrid Inputs** on Create Video.

### AI visuals

Choose **AI-generated visuals**, then provide a source document or source URL. The planner uses the source to create Remotion scenes.

### Existing video

Choose **Use my existing video**, then upload `.mp4`, `.webm`, or `.mov`. The uploaded video remains the main visual content.

### AI narration

Choose **AI-generated narration** and select **First person** or **Third person**. AI narration is generated only when it is selected.

### Exact script

Choose **My narration script** and paste the exact words to speak. The tool sends those words to ElevenLabs without rewriting them.

### Existing audio

Choose **My narration audio** and upload supported audio. ElevenLabs is skipped. The visual timing follows the measured audio duration.

The full combination table is in [INPUT-MATRIX.md](INPUT-MATRIX.md).

## 5. Choose branding

Open **Settings → Video branding** to set the shared brand name, tagline, CTA, contact information, logo, intro, and outro. Use **Preview branding** to inspect the local result. Previewing branding does not contact either provider.

In Create Video, leave intro/outro on **Use global setting** or choose a job-level mode override. Existing jobs keep their resolved branding snapshot.

## 6. Start generation

Open **Settings** and press **Start worker**. This is the deliberate action that allows queued production jobs to call OpenRouter and ElevenLabs. The worker claims due jobs, processes them, and records stage events.

The job detail page shows the current stage. Completed Videos shows only outputs that passed validation.

## 7. Schedule and manage jobs

- **Generate now** creates an immediately eligible queued job.
- **Schedule** stores a future time.
- **Retry** returns a failed job to the queue.
- **Reschedule** changes a future time.
- **Cancel** stops an eligible scheduled or queued job.

Pausing the worker does not delete jobs. It only prevents new work from being claimed.

## 8. What a completed result contains

A completed job has a validated MP4 and poster. Its detail page can show the normalized source, structured plan, generated narration, measured audio duration, stage events, and output preview. The server does not expose raw environment files, provider logs, or arbitrary filesystem paths.

## 9. If something fails

Start with the job’s error stage and message, then read [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Common causes are a paused worker, missing provider configuration, invalid source type, narration that cannot fit a fixed duration, unsupported media, or a failed final validation.


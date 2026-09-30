# Phase 3: Narration, TTS, and Rendering

## Narration sources

The pipeline distinguishes the narration source from the visual source:

- `AI_SCRIPT`: the planner creates scene-aligned narration. ElevenLabs synthesizes it unless a valid cache is used.
- `USER_SCRIPT`: the user’s exact script is authoritative. It is stored verbatim, divided across scenes only for visual alignment, and sent to ElevenLabs without rewriting.
- `USER_AUDIO`: the user’s audio is authoritative. It is measured locally and ElevenLabs is skipped.

The older content-level `voiceover_mode` values (`auto`, `supplied`, and `hybrid`) still control ordinary source-backed planning. Phase 7 user-script and user-audio choices take precedence for that job.

## ElevenLabs flow

The TTS adapter calls the ElevenLabs speech endpoint with timestamps. The response contains audio and character-level alignment when available. The adapter writes the MP3 and a cache record. A cache is reused only when its text/voice/model/format/settings fingerprint, audio hash, and local audio probe remain valid.

The runner sends narration text only. It does not send the entire source document to ElevenLabs. It reads `voiceover.txt` back before TTS and refuses to continue if the file changed after planning.

## Pre-TTS budget

The pre-TTS check estimates speaking time using the configured words-per-minute and pause allowance:

```text
spoken seconds = word count / words per minute * 60
pause allowance = duration seconds / 60 * pause seconds per minute
estimated seconds = spoken seconds + pause allowance
available seconds = duration seconds - ending buffer seconds
```

The default configuration is 150 words per minute, 4 pause seconds per minute, and a 0.5-second ending buffer. The estimate is a guardrail, not a promise: the measured output audio remains authoritative.

Raw Markdown, code fences, headings, commands, URLs, Markdown links, and table rows are rejected as narration. Users should provide a dedicated spoken script instead of pasting a source document into the script field.

## Supplied scripts are not silently changed

For `USER_SCRIPT`, the complete script is preserved in `voiceover.txt`, `voiceover.text`, and `fullVoiceover`. The helper allocates slices to scenes in proportion to their visual durations, but it does not rewrite the text. The concatenated scene slices preserve the original script.

If an exact user script does not fit a fixed duration, the job fails and asks for a shorter approved script. It is not silently shortened. In auto-duration mode, the plan can become longer to accommodate an approved supplied script.

## External audio timing

For `USER_AUDIO`, the runner probes the file locally. In auto-duration mode, the plan grows when necessary so the audio plus the ending buffer fits:

```text
required frames = ceil((audio duration + ending buffer) * FPS)
new total frames = max(authored total frames, required frames)
```

The existing scene proportions are scaled to the new duration and made contiguous. In fixed-duration mode, audio that exceeds the available duration is rejected. Audio is never accelerated.

## AI audio alignment

For generated TTS, character timestamps are used to estimate scene boundaries from the narration associated with each scene. The measured audio duration and the configured ending buffer determine the final timing. The authored plan remains available; post-TTS timing is stored in `render-plan.json`.

## Final media validation

Validation probes the rendered MP4 and checks:

- the render succeeded;
- a playable video stream exists;
- dimensions match the plan;
- FPS matches the plan;
- duration is within configured tolerance;
- frame count equals the plan’s total frames;
- an audio stream exists;
- the voiceover is positive and ends before the video by at least 0.15 seconds.

Queue completion and UI completion require validation to pass. A render file alone is not considered a completed video.


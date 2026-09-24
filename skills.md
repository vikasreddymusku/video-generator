Tinitiate Remotion Video Automation Skill

Purpose

Build a repeatable, theme-driven pipeline that converts course/content Markdown into a narrated MP4 using Remotion.

This replaces the older pipeline:

Markdown -> AI slide plan -> PPTX -> ElevenLabs audio -> PPTX-to-video -> MP4

with:

Markdown -> AI video plan -> ElevenLabs voice-over -> Remotion -> validation -> MP4

Remotion is the video renderer. Do not generate PPTX files.

1. Core architecture

For each pending entry in video-source.md:

Load the source Markdown.

Parse frontmatter and content.

Build a normalized content object.

Create video-plan.json using the configured planner.

Extract or generate the narration script.

Generate ElevenLabs voice-over.

Measure the real voice-over duration.

Finalize scene timing from the real audio duration.

Render the plan with reusable Remotion scene templates.

Add configured music and sound effects.

Render the final MP4.

Validate the output.

Only after successful validation, add <!-- done --> to the queue entry.

Never mark an item done on a partial or failed run.

2. Two planner modes

Mode A - Codex test mode

Use this first while developing the pipeline.

Codex must:

Read this file completely.

Read automation.config.json.

Read themes.json.

Read the pending Markdown source.

Create the same video-plan.json schema that the future OpenRouter planner will create.

Run the local TTS/render/validation scripts.

Codex is only substituting for the remote planner in this mode. The downstream ElevenLabs + Remotion pipeline must be the same as production.

Mode B - OpenRouter production mode

After Codex test mode is stable, the local automation must call OpenRouter from planner.ts and request the exact same video-plan.json schema.

Changing from Codex to OpenRouter must not require changes to course Markdown, scene components, themes, TTS code, or rendering code.

3. Queue contract

Use root-level video-source.md.

Example:

# Videos

* ./inputs/ml-engineering.md
* ./inputs/agentic-ai.md
* ./inputs/python-full-stack.md <!-- done -->

Rules:

One Markdown source per bullet.

Support local .md files first.

<!-- done --> means skip.

Do not mark done until final MP4 validation passes.

--force may explicitly reprocess completed items.

4. Input Markdown contract

Input Markdown contains CONTENT, not automation-provider configuration.

Recommended frontmatter:

---
title: Machine Learning Engineering
slug: ml-engineering
brand: Tinitiate AI Solutions
video_type: course-promo
duration_seconds: 30
aspect_ratio: landscape
resolution: 1920x1080
fps: 30
theme: future-neon-blue
cta: Enroll Now
website: www.tinitiateai.com
email: contact@tinitiateai.com
phone: +91 6309123485
address: 13-16-58, Road No 4, Kamala Nagar, P&T Colony, Chaitanyapuri, Hyderabad, 500060, Telangana, India
tagline: LEARN. BUILD. LEAD THE FUTURE.
---

Do NOT place API keys, OpenRouter model names, ElevenLabs provider settings, or other global automation configuration inside course Markdown.

The Markdown may contain a supplied voice-over section. When supplied, treat it as authoritative unless timing makes it impossible to fit the requested duration.

Never invent unsupported course facts, salary claims, certifications, partnerships, placement percentages, guarantees, or pricing.

5. Global automation configuration

Use root-level automation.config.json.

It controls:

planner mode and model

ElevenLabs model and default voice

output directories

render defaults

audio levels

validation behavior

Secrets must come from .env, never from Markdown or React source.

Expected environment variables:

ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
OPENROUTER_API_KEY=...

OPENROUTER_API_KEY is only required in OpenRouter production mode.

6. Planner output contract

The planner must output structured JSON only.

Required top-level shape:

{
  "schemaVersion": 1,
  "compositionId": "MLEngineeringPromo",
  "slug": "ml-engineering",
  "title": "Machine Learning Engineering",
  "videoType": "course-promo",
  "theme": "future-neon-blue",
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "targetDurationSeconds": 30,
  "totalFrames": 900,
  "narration": {
    "mode": "continuous",
    "text": "..."
  },
  "scenes": []
}

Each scene must contain:

{
  "id": "workflow",
  "type": "process-flow",
  "startFrame": 240,
  "durationInFrames": 180,
  "headline": "FROM DATA TO DEPLOYMENT",
  "supportingText": ["DATA", "FEATURES", "TRAIN", "EVALUATE", "DEPLOY"],
  "visual": {
    "variant": "horizontal-pipeline",
    "emphasis": "sequential activation"
  },
  "narration": "...",
  "transitionIn": "scan-wipe",
  "transitionOut": "energy-sweep",
  "sfx": ["ui-tick"]
}

Rules:

4-8 scenes for a 30-second promotional video.

One main communication goal per scene.

On-screen text must be shorter than narration.

Do not create arbitrary React source code per course.

Prefer existing reusable scene types.

Total frames must equal the requested video duration.

Use only facts found in the input Markdown or project brand configuration.

7. Reusable Remotion scene system

The renderer must use a fixed scene library. The planner chooses scene TYPES and supplies content.

Initial scene types:

brand-intro

hero-title

process-flow

feature-grid

technology-stack

project-showcase

code-demo

metric-highlight

quote-or-benefit

cta

Do not create new scene code for every course unless the existing scene library truly cannot represent the required idea.

Recommended reusable components:

BrandMark

AnimatedTitle

KineticWords

FeatureCard

TechBadge

PipelineNode

GlowLine

ParticleBackground

HudGraphic

ContactPanel

TransitionOverlay

8. Remotion rules

Use React + TypeScript + Remotion.

All motion must be deterministic and frame-based using Remotion primitives such as:

useCurrentFrame()

useVideoConfig()

interpolate()

spring()

Easing

Sequence

Series

Remotion transition primitives where appropriate

Do not use:

CSS @keyframes

CSS transitions for animation timing

setTimeout

setInterval

non-deterministic Math.random()

external HTTP requests during rendering

Any pseudo-random visuals must derive deterministic values from a stable seed or item index.

The output must feel like motion design / advertising, not a static presentation.

9. Themes

Themes come only from themes.json.

A theme controls:

background and surface colors

primary/secondary accents

text and muted colors

typography

border radius

glow intensity

particle/HUD density

card style

transition family

CTA style

music personality

SFX personality

Theme precedence:

explicit CLI override

input Markdown theme

themes.json active theme

project fallback theme

The renderer must not hardcode one course's colors or technology names.

10. Voice-over rules

If the input Markdown contains supplied narration:

Use it as the source script.

Do not rewrite it merely for stylistic preference.

Estimate duration before TTS.

After ElevenLabs generation, measure the actual audio duration.

If the real audio does not fit, adjust scene timing first.

Only shorten narration if the requested total duration still cannot be met cleanly.

Final CTA narration should have breathing room.

If no narration is supplied, the planner may generate it from the source content.

For 20-60 second promotional videos, prefer one continuous narration file.

11. ElevenLabs TTS

TTS runs in Node automation code, never inside Remotion React components.

Source secret:

process.env.ELEVENLABS_API_KEY

Voice selection priority:

optional per-input voice override

ELEVENLABS_VOICE_ID

configured project fallback voice ID

Cache TTS by a hash of:

narration text

voice ID

model ID

relevant voice settings

If the hash is unchanged and a valid audio file exists, reuse it.

Write the generated audio to the item's output folder and copy/link it into a local public path that Remotion can load.

Never expose API keys in browser code, rendered metadata, Markdown, logs, or committed files.

12. Audio mixing

Voice-over is always dominant.

Default mix targets:

voice-over: 1.0

music: 0.08-0.16 under narration

whooshes/sweeps: 0.20-0.45

UI ticks: 0.12-0.30

CTA impact: 0.30-0.55

Use frame-based fades/ducking.

Do not let background music obscure speech.

13. Output structure

Create one output folder per item:

output/
  <slug>/
    source.md
    metadata.json
    video-plan.json
    voiceover.txt
    audio/
      voiceover.mp3
    public-assets/
    renders/
      preview.mp4
      final.mp4
      poster.png
    logs/
      run.log
      validation.json

Reusable React code stays under src/; do not duplicate application code into every output folder.

14. Idempotency and retry

Every expensive step must be resumable.

source unchanged -> reuse normalized source

plan hash unchanged -> reuse video plan

narration/TTS hash unchanged -> reuse audio

local asset unchanged -> reuse asset

failed render -> keep valid plan/audio/assets and retry only rendering

Do not mark a failed item done.

15. Validation

Before marking complete, verify:

final MP4 exists and is non-empty

expected width/height

expected FPS

duration within allowed tolerance

audio track exists when narration is enabled

no missing local media

no render errors

no TypeScript errors

Write results to validation.json.

Only then append <!-- done --> to video-source.md.

16. Codex test procedure

For the first ML Engineering test:

Read video-source.md and locate the pending ML Engineering source.

Read automation.config.json, themes.json, and the complete Markdown.

Create output/ml-engineering/video-plan.json using the required schema.

Create output/ml-engineering/voiceover.txt from the supplied narration.

Ensure the generic Remotion renderer can consume this plan.

Run ElevenLabs TTS if enabled.

Finalize timings using the real narration duration.

Preview in Remotion Studio.

Render the MP4.

Validate it.

Mark the queue entry done only after validation succeeds.

Do not use OpenRouter in this phase.

17. OpenRouter production procedure

After the Codex test produces an acceptable video:

Keep the same Markdown contract.

Keep the same video-plan.json schema.

Keep the same ElevenLabs TTS code.

Keep the same themes.

Keep the same Remotion renderer and reusable scenes.

Replace only the planner implementation with an OpenRouter call.

Require JSON-schema-valid planner output before continuing.

Retry malformed planner responses safely; never render invalid plans.

The planner provider must be swappable without affecting the rest of the pipeline.

18. Hard rule against course-specific automation logic

Do not hardcode:

AWS

Machine Learning

Python

Agentic AI

any course title

any technology list

any scene wording

inside the generic automation engine.

Course-specific information belongs only in the input Markdown and generated video-plan.json.

Themes may define visual style, but never course content.
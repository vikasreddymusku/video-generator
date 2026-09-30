# Testing

## Test layout

The repository currently contains:

- 40 automation tests under `src/automation/`;
- 16 server tests under `src/server/`;
- 4 Playwright UI tests in `tests/ui/workflows.spec.ts`.

The test names and fixtures cover queue behavior, source loading, metadata, planner caching and validation, branding, all six hybrid combinations, provider privacy, job lifecycle, ingestion, security, UI navigation, branding, responsive behavior, and Hybrid Inputs controls.

## Recommended checks

```powershell
npm.cmd run test:automation
npm.cmd run test:phase5
npm.cmd run test:ui
npm.cmd run lint
npm.cmd run build:ui
git diff --check
```

PowerShell installations may require `npm.cmd` and `npx.cmd` instead of the `.ps1` shims.

## Provider safety in tests

The tests inject fake planners, fake fetch functions, fake audio probes, and fake renderers where appropriate. The UI tests use an offline server. The repository’s documented verification workflow is designed not to call OpenRouter or ElevenLabs.

Do not start the real worker against a queued production job merely to run tests. Use the offline mode, test commands, or injected dependencies.

## What the tests verify

### Automation

- queue order and completion gating;
- source normalization and remote source behavior;
- metadata resolution and source identity;
- schema-valid plans and source-backed code/diagram/metric evidence;
- planner cache fingerprints and retry behavior;
- narration budget rejection and supplied-script preservation;
- ElevenLabs adapter and audio alignment behavior;
- branding frame insertion and QR rules;
- render receipt and final media validation;
- all six hybrid combinations and external timing.

### Server

- local-only and cross-origin request policy;
- safe URL validation and SSRF protections;
- supported source uploads and malformed document rejection;
- PDF, DOCX, and PPTX extraction;
- job creation, worker pause/offline behavior, stage events, retry, cancel, and complete;
- controlled artifact delivery and safe error redaction;
- branding API behavior and asset validation.

### UI

- page navigation and queue actions;
- mixed source scheduling;
- responsive navigation and upload validation;
- branding preview and batch overrides;
- visibility of all six Hybrid Inputs combinations without provider calls.

## Validation philosophy

Tests should verify behavior at the boundary that matters:

1. Does the input contract reject invalid data?
2. Does the selected capability avoid unnecessary provider work?
3. Is the authoritative user input preserved?
4. Is timing based on measured media?
5. Can an invalid output reach completed status?
6. Can an error expose a secret or local path?

When adding a feature, extend the nearest existing suite instead of adding a separate testing framework.


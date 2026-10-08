---
name: zhike-courseware-integration
description: Build, repair, review, validate, and package courseware plugins for the Zhike AI teaching platform. Use when work mentions 智课, the meiyu repository, launchToken/platformApiBase/returnUrl, STATIC/NODE/BOTH manifests, courseware score or artifact reporting, classroom courseware ZIP delivery, or adapting a standalone interactive lesson into Zhike. Do not use for generic websites or lesson plans that do not integrate with the platform.
---

# Zhike Courseware Integration

Build courseware as a platform plugin, not as an independent account system. Treat `references/courseware-integration-whitepaper-v3.md` as the normative contract and use `references/acceptance-checklist.md` before delivery.

## Start With Context

1. Read the requirement, existing source, `manifest.json`, and the relevant whitepaper sections.
2. Establish the assigned courseware `title`, `slug`, teaching goal, age range, score rule, randomization rule, required saved outputs, and expected runtime type.
3. If working inside the Zhike `meiyu` repository, read `AGENTS.md` and `coursewares/catalog.json`. The catalog values are authoritative.
4. Identify whether this is a formal platform plugin or only a standalone demo. Do not claim a demo is integrated until launch verification and result reporting work.
5. Inspect the current git status and preserve unrelated changes.

If critical assigned metadata is missing, derive only reversible implementation details. Do not invent a production slug or deploy target.

## Choose Runtime Conservatively

- Use `STATIC` for browser-only quizzes, sorting, drag-and-drop, and lightweight games.
- Use `NODE` when the server owns rendering or APIs.
- Use `BOTH` for camera, recording, generated media, AI calls, custom work pages, or other server-backed interactions.
- Keep third-party API keys in server environment variables. Never put them in browser code, source packages, logs, examples, or prompts.

Use only the implemented manifest fields: `slug`, `title`, `runtimeType`, `entry`, and `nodePort`. Use `nodePort: null` unless the platform maintainer explicitly assigns otherwise.

## Preserve the Platform Boundary

The courseware may implement teaching interaction, feedback, scoring, media generation, and result presentation. It must not implement platform login, registration, password reset, class membership, course-open decisions, or direct database access.

Read these launch query parameters at runtime:

- `launchToken`
- `platformApiBase`
- `returnUrl`

Do not hardcode production domains, localhost, IP addresses, student IDs, or fixed Node ports. Verify the launch with the platform and trust only the returned context.

For local preview, support `?demo=1` only when useful. Display `本地预览，成绩不会保存` and do not call production APIs in demo mode.

## Make Completion Reliable

Use one centralized completion path:

1. Calculate a finite score in the inclusive range `0-100` and a nonnegative integer duration.
2. Disable duplicate submission while saving.
3. Upload every required artifact and keep successful upload results in memory for retry.
4. If any required artifact fails, stop final submission and show a retryable partial-failure state.
5. Await a successful `COMPLETED` record before displaying `成绩已保存`.
6. Only then allow the normal return action.

Never navigate first and save in the background. Do not rely on a single return button, `beforeunload`, or `sendBeacon` for final submission. The platform's injected floating return control is navigation only.

On retry, reset score, counters, current item, selections, timers, generated content state, completion flags, and save flags. Ensure no UI can display `NaN`, `undefined`, `[object Object]`, raw JSON, source code, or stack traces.

## Handle AI and Multi-Result Tasks

Model multi-image or multi-stage generation as a parent task with explicit child states. Show successful partial outputs as partial, keep them for retry, rerun only failed items, and do not report `COMPLETED` until every required result succeeds.

Use real progress derived from task state. Add server-side timeouts, bounded retries, request IDs, and structured logs without tokens, keys, personal data, or full generated content. Prevent retries from causing duplicate paid requests when the provider supports idempotency.

## Build for the Runtime Path

- Use relative front-end asset and API paths that work below `/{courseSlug}/{coursewareSlug}/`.
- Bundle required scripts, styles, images, audio, fonts, and model files locally.
- Do not depend on public CDNs or remote hotlinked presentation assets.
- For Node runtimes, read `PORT` from the environment and declare dependencies in `package.json`.
- Do not package `node_modules`.

## Verify Before Delivery

Run the portable structural validator:

```bash
python3 scripts/validate_courseware.py /path/to/courseware
python3 scripts/validate_courseware.py /path/to/courseware.zip
```

When working inside the canonical `meiyu` repository, also run:

```bash
npm run coursewares:test
npm run coursewares:validate
npm run secrets:scan
```

Test the actual interaction in a browser at minimum at:

- `1440x900`
- `1024x768`
- `768x1024`
- `390x844`

Exercise happy path, retry, fast repeated clicks, save failure, expired or missing launch context, denied camera/microphone permission when relevant, and partial AI generation failure. Inspect the rendered page for clipping, overlap, raw code, unstable controls, missing assets, and touch-only problems.

For a formal platform acceptance, launch from the student portal and verify that the teacher/student record views and default projection can read the final summary and artifacts.

## Deliver Deliberately

Deliver source, a standard ZIP, version or git revision, SHA-256, test evidence, and known limitations. Keep credentials, `.env`, databases, student data, logs, private keys, and Git metadata out of the package.

Do not deploy, publish, migrate data, or change production infrastructure without explicit authorization. Completing a ZIP is not permission to upload it to production.


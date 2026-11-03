# Teacher And Student Workspace Refresh

Date: 2026-11-03. Scope: the selected option 1, adapted to the existing platform without removing role functionality. No backend, database, account, schedule, courseware runtime or scoring changes.

## Visual Evidence

- Source visual truth: `/Users/zeng/Documents/New project/output/teacher-workbench-ui-20261102/01.png` (1487 x 1058).
- Teacher implementation: `/Users/zeng/Documents/New project/output/portal-refresh-20261103/teacher-desktop.jpg` (1425 x 1013).
- Student implementation: `/Users/zeng/Documents/New project/output/portal-refresh-20261103/student-desktop.jpg` (1425 x 1013).
- Combined comparison input: `/Users/zeng/Documents/New project/output/portal-refresh-20261103/design-comparison.png`. Source and teacher implementation were both fitted into 900 x 640 comparison regions, preserving aspect ratio. This is a style/layout comparison, not a pixel-identical screenshot clone.
- Browser CSS viewport: 1440 x 1024. IAB screenshots exclude scrollbar strips; image dimensions above are the actual captures, not an assumed device density.
- Responsive captures: `teacher-tablet.jpg`, `teacher-mobile.jpg`, `student-tablet.jpg`, `student-mobile.jpg` in the same output directory. CSS viewports checked at 1024 x 768, 768 x 1024, and 390 x 844; no document-level horizontal overflow. Wide data tables retain their own horizontal scroll.
- State: authenticated teacher/student, synthetic local fixture data only. Five assignments include OPEN, READY and ENDED; six records include completed, started and unscored work; thirteen pending submissions exercise pagination.

## Comparison History

1. [P2, fixed] The initial student capture inherited white headings, a 320px minimum height, 42px course text and oversized blue controls from the old student layout. Added scoped typography, height, spacing and button overrides. The post-fix `student-desktop.jpg` and `student-mobile.jpg` show a visible module heading, compact course overview and green primary action.
2. [P2, fixed] The initial mobile navigation clipped the final modules. Replaced the small-screen horizontal strip with five equal icon/label columns. Post-fix teacher and student mobile captures show all five entries within the viewport.
3. [P2, fixed] The first teacher layout placed the submissions table below the full agenda height. Nested the submissions module into the classroom grid column, beside the independent agenda. The post-fix desktop capture shows submissions directly after coursewares.
4. Final combined visual comparison found no remaining actionable P0/P1/P2 mismatch. Full-size desktop and mobile captures were also inspected for readable row text, button labels and navigation; these provide the focused control/typography evidence that the reduced combined image cannot show alone.

## Required Fidelity Surfaces

- Typography: system Chinese sans-serif with PingFang SC / Microsoft YaHei fallbacks, dark charcoal titles, 14-15px operational text, compact module headings and zero letter spacing. Long labels wrap without obscuring adjacent controls.
- Spacing/layout: narrow sidebar, unframed white sections, current classroom first, compact courseware rows, tabular submissions and right-hand daily agenda. All modules have small headings. Desktop and mobile controls remain accessible.
- Colors/tokens: restrained forest-green actions, white background, light gray separators, amber pending count and semantic status tags. No new decorative gradients or nested cards.
- Images: the existing sharp kiln asset is reused instead of inventing a new course photograph; the crop is responsive. No broken images in either tested dashboard. Other courses retain a neutral book icon when no course artwork is available.
- Copy/content: navigation and module titles reflect existing role workflows. The mock's batch-selection controls were not added because the current business has no corresponding batch API. Real assignment selection, class start/end and original preparation/record controls remain available.

## Functional Verification

- Teacher browser checks: current classroom, courseware close/reopen, classroom control drawer, preparation/review entry, per-courseware records and sorting, schedule calendar, save-time dialog, class student list, all submissions and record detail.
- Student browser checks: current classroom, courseware selection, preparation entry even before class opens, disabled launch for READY class, all five assignments, all six records, history grouping, unscored record detail and projection entry.
- Existing 44 state/handler statements in RolePortal match the pre-refresh source unchanged, excluding removed header copy and the added navigation state. Student detail now uses the existing fresh-record loader rather than a stale list row.
- `npm run agent:check` passed: type checks, builds, 318 automated tests, thirteen courseware manifest validations and sensitive-data scan. The five new portal tests are registered through `npm run portal:test`.
- Shared projection parity tests cover teacher/student/administrator records and latest-record fetching. A real popup screenshot could not be captured in IAB, so source/unit parity is not claimed as a live browser projection-window acceptance.
- Browser console: no errors in the final teacher/student fixture pages.

## Release Boundary

Local browser tests use synthetic data, not real student records. Production deployment must use the verified Git commit after backup, update only the web bundle, retain the old static assets, verify public bundle hashes and API health, and avoid database migration/API restart. Live authenticated classroom operations were not repeated merely for UI acceptance, to avoid changing real teaching data.

## Implementation Checklist

- [x] Teacher option-1 style and module headings.
- [x] Matching student style and complete navigation.
- [x] Existing API calls, access restrictions and drawers retained.
- [x] Desktop/tablet/mobile visual verification.
- [x] Build, regression and secret scanning passed.

Final result: passed

# Restoration Preparation Review Refresh

Date: 2026-11-03. This supplement preserves the dashboard acceptance above. Scope: the accepted teacher-review simplification, styled consistently with the white/forest-green teacher workspace. No API, server, schema, permission, student-data, scoring or budget change.

## Evidence And Comparison

- User-provided source: `/var/folders/6n/lqkmxm0d5034kwkjr719ygmc0000gn/T/codex-clipboard-7c4b8ec5-bb99-4586-84a0-f91f14049765.png`.
- Current implementation screenshots: `/Users/zeng/Documents/New project/output/restoration-review-20261103/desktop.jpg`, `tablet.jpg`, `mobile.jpg`, `settings.jpg`. Captured and inspected at CSS viewports 1440×900, 768×1024 and 390×844 using virtual local students only.
- The previous tall date/instructions/classroom sections are secondary dialogs. The first screen now shows pending counts, student selection, current evidence, source/finding and continuous review actions. Images retain their full aspect ratio and existing zoom control.
- This is a workflow redesign, not a pixel clone: compare information priority, readable operational text, task density and preserved controls against the user screenshot, not identical spacing.

## Iterations

1. Fixed inherited brown primary-button shadow and broad legacy preparation margins with scoped teacher-only styles.
2. Replaced the tall mobile student list with a selector plus optional name search, preserving space for evidence and review actions. Tablet retains the two-column work area. No document-level horizontal overflow in tested viewports.
3. Fixed datetime input compatibility with input/change handling. Start/end validation errors remain visible inside the settings dialog.
4. Re-read details on revision conflict without advancing; cleared old image readiness on reread. Failed pictures prevent approval but still permit return with a reason.
5. Final desktop, tablet, mobile and settings screenshots inspected: no clipped headings, broken normal-state images, overlapping controls or actionable P0/P1/P2 visual issues. Mobile evidence can scroll beneath the sticky review footer; images remain zoomable.

## Verification And Limits

- Seven new automated tests cover roster/counts/search, next-student selection, identity/revision/digest, confirmed saves, no write retry, real teacher rendering and all four student preparation states.
- Browser checks cover approval/return/next, persisted feedback, supplementation, dates, image zoom/retry/failure, stale revision and rapid selection, mobile search/selection, Escape/focus restoration. Dialog tab order includes select fields.
- All 325 automated tests and thirteen package validations pass; no unexpected console errors in the final normal state. Expected 503/409 failures were deliberately simulated with local fixtures.
- Live static/hash/health verification is separate from real authenticated teacher approval. No real student was reviewed for UI testing; no paid AI request was made.

Final result: passed locally. Release evidence is recorded separately after public hash and health verification.

# Student Preparation Workspace

Date: 2026-11-03. Accepted follow-up to the teacher review refresh. Source: the user's `codex-clipboard-b0eee1b5-6c66-42c3-adc0-7caac671c63d.png` screenshot. Implementation screenshots under `/Users/zeng/Documents/New project/output/student-preparation-20261103/`: `desktop-approved.jpg`, `empty-task.jpg`, `edit-card.jpg`, `tablet.jpg`, `mobile.jpg`. These show synthetic local students, not production records.

The old full-width instruction/status blocks move to a compact status row and task sidebar. Saved evidence is now the primary surface, with image, source and finding together. All modules have small headings. The white/forest-green type, button and divider system matches teacher review, while classroom artwork is unchanged.

Iteration: the first capture inherited the old oversized brown submit button. Increased specificity only for student submission states, removing the old shadow, large type and colored status background. Post-fix approved desktop capture has a compact review state and clear return action. Empty tasks say no material uploaded; existing pictures say saved to this task. No automatic seeding or real student writes are part of this UI change.

Browser verification: upload via chooser, edit/save source and finding, exclude/re-adopt, submit, reopen, missing-field failure and retry, submitted/approved locking. Desktop 1440×900, landscape tablet 1024×768, portrait tablet 768×1024 and mobile 390×844 checked for overflow, image containment and button text. Full-page responsive screenshots preserve the complete scrollable content. Modal escape/focus logic retains image-inspector precedence. Teacher selectors remain separate, and teacher regression tests still pass.

Automated verification: 327 tests, build/type checks, 13 package validations and secret scanning. Production static/hash/health verification is recorded after release; no live student review is changed for UI testing and no paid AI is invoked.

Final result: passed locally, with live authenticated teacher/student classroom interactions not repeated against real data.

## Single Clue Deletion Follow-up

2026-11-03. Source: user's `codex-clipboard-8fa87916-548b-45cc-957c-96bd11f98e6f.png`. Added the familiar trash icon with a per-clue accessible name and tooltip to active and excluded clue cards. It remains disabled while writing or when preparation is locked. A compact confirmation dialog states that the picture and notes are removed permanently; default focus is on cancellation, with Escape and focus restore retained.

Current synthetic-data captures: `/Users/zeng/Documents/New project/output/clue-delete-20261103/desktop.jpg`, `confirmation.jpg`, `protected.jpg`, `mobile-confirmation.jpg`, `tablet.jpg`. Initial screenshot immediately following viewport resize had unsettled framing and was discarded; the accepted desktop capture was retaken after observing stable DOM. Desktop, tablet and phone widths show no horizontal overflow, cropped dialog text or overlapping card controls. Successful delete reduces the list; protected-delete failure leaves the card and an actionable explanation.

Full regression: 331 tests and 13 package validations. Added real endpoint checks for ownership, submitted/approved locking, closed windows and supplements, physical file removal, history protection, persist failure and unchanged AI usage. No actual production clue was deleted during verification. This change includes a narrowly scoped service-side protection fix, so deployment requires an idle restoration-service restart after backup.

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

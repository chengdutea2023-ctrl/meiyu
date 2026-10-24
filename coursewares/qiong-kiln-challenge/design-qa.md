# Selected image implementation QA

## Current release: 1.2.0, selected option 2, 2026-10-24

Source visual truth: `/Users/zeng/.codex/generated_images/01a11b70-4a93-76d0-b3a4-d2978528f7fc/exec-2786321c-a536-4f49-a7ad-5e4b5acaf3f9.png`.
Implementation: `http://127.0.0.1:4197/?demo=1`; actual classroom-contract browser tests use an isolated local fixture, never production writes.
Source dimensions: 1672x941. Matched implementation: 1672x941 CSS/pixels, DPR1, no stretch. Comparison state: manual mode after three actual heat actions, heat73, energy15, maturity1/3. Source illustrative heat68 is not forced into the real engine.
Full-view paired review input: source image and `output/kiln-guided-qa/manual-warm-1672.png` were opened together. Additional implementation captures: `manual-1440.png`, `manual-1024.png`, `manual-768.png`, `manual-390.png`, `ai-1440.png`, `ai-390.png`, `report-1440.png`, and entry captures in `/Users/zeng/Documents/New project/output/kiln-guided-qa/`.

### Iterations and resolved findings

- [P2, fixed] Initial title plaque was undersized and used a flat panel. Installed an actual generated blank stone plaque, increased its occupied width, kept title as accessible real text.
- [P2, fixed] Disabled next-step text inherited translucent opacity over detailed artwork. Replaced it with an opaque readable surface; actual completion prerequisites still disable navigation.
- [P2, fixed] Old fixed/AI selectors moved the help control over the reward settings. Explicit mode selectors now keep it in the lower-right safe zone on desktop and lower-left on smaller screens. Narrowed the automatic-control dock to separate it from settings.
- [P2, fixed] Tablet portrait left an unused band below the manual scene. Manual scene now fills available height and anchors controls to the foreground. Small-screen advanced settings flow below the scene rather than covering the jar.
- [P2, fixed] At the reference viewport the control grips approached the instruction bubble. Lowered desktop controls, retained the bubble below the complete jar; moved the phone reset button out of the hint area.

### Required fidelity surfaces

- Typography: real Chinese system sans text, bold title, stable-size readable labels and tabular readings; no text baked into functional images. Three mode buttons have explicit accessible names. No negative tracking or viewport-scaled font sizes.
- Layout: full-bleed centered kiln/jar, left heat bar, right energy/maturity, upper-left plaque, three numbered modes above, tactile operations on foreground table. Responsive screenshots show complete controls and no horizontal overflow at 1672x941,1440x900,1024x768,768x1024,390x844.
- Color: blue sky, green jar/heat bar, red/yellow/blue physical controls, ivory readouts and green automatic commands. Selection and disabled states remain legible over scene detail.
- Assets: actual generated kiln, cold/warm variants, transparent three-control sprite and stone plaque are local runtime assets; no code-drawn kiln or lever substitutes. Locally bundled Phosphor icons retain their license. The original concept is not used as a flattened interactive screenshot.
- Copy: real values and instruction text follow actual actions. Heat remains a teaching index, not Celsius. Three simplified stages, entry guide and actual Q-learning are preserved; energy-focused failure is valid data, not overwritten with success.

### Verified interaction and scope

- Five viewport fixtures passed manual success, automatic fixed run, two different real reward trainings, advanced settings, report selection/concept answer, simulated first-save failure and retry (two artifacts uploaded once, one completed record, score100). Expired launch blocks actions and never opens the guide. No browser script errors.
- Entry popup opens on verified entry, start closes it, help reopens it, Escape closes it; invalid entry does not show it. IAB actual local preview also visually checked.
- Full project build/lint, 97 automated tests, 13 package validations and sensitive-data scan passed. Final deployment and offline-package smoke checks are recorded separately at release time.
- Engine, platform client, accounts, assignments, historical scores, database schema and the other two lesson implementations are unchanged.

### Accepted differences / residual checks

- Source numbers are illustrative; actual heat/data always take precedence. Readout surfaces are simpler for legibility and standard check-circle replaces the decorative pottery glyph. No decorative connector curve between tabs; functional order is explicit in numbers.
- Scene is raster artwork with a heat-driven cold/warm crossfade, not a new 3D engine. Phone/tablet settings stack below the playable scene. No real-device Safari/iPad hardware test was performed; responsive browser testing is not a hardware claim.
- Actual production student submission is not repeated solely for visual QA; isolated fixture verifies the unchanged contract and retry behavior without altering student records.

Current visual QA final result: passed

## Historical option 1 implementation (superseded)

Source visual truth: `/Users/zeng/Documents/New project/output/qiong-kiln-ui-directions/01-immersive-workshop.png`.
Implementation: `http://127.0.0.1:4196/?demo=1`.
Selection: displayed option 1, confirmed by user on 2026-10-21.

## Iteration 1

- [P0] Click events bubbled into mode binding on the body.
  Evidence: after heat/heat/heat/hold the browser readouts still showed heat20, energy0 and step0. Adding body data-mode for responsive styling unintentionally matched the existing generic event selector.
  Fix: restrict view and mode event bindings, active-state updates and disabled-state selectors to buttons. Retest the actual browser before accepting.

## Iteration 2

- [P0] Action binding regression fixed. Browser confirmed heat70, energy17, step4/22 and maturity2/3 after heat/heat/heat/hold.
- [P2] First matched comparison found the right status panel too tall (596px versus approximately485px at source-normalized1440 width); the extra status footer and chart height changed the reference proportions.
  Evidence: `output/qiong-kiln-immersive-qa/comparison-layout.jpg` and `comparison-focus.jpg`, source and implementation in the same input.
  Fix: reduce the readout spacing, cap the dial at207px, reduce chart height to110px, and move the redundant status footer to screen-reader-only content. Increase header type and mode labels to match the source hierarchy. Use filled library icons for the primary controls.
- Capture normalization: initial user-origin preview has110% browser zoom. Dedicated localhost QA tab uses DPR1 and actual1440x900CSS viewport, keeping the user zoom setting intact.

## Final evidence and review

- Source pixels:1586x992. Final implementation pixels:1440x900, CSS viewport1440x900, DPR1. Reference was proportionally contained in the same side-by-side comparison input, without stretching. The first user-origin capture used110% zoom; all final comparisons use a separate localhost tab at DPR1 without changing the user browser preference.
- State:manual mode after heat/heat/heat/hold, energy17, step4/22, maturity2/3. The design illustration says heat72; the unchanged seeded engine actually yields70. Live data takes precedence. The mock's dotted future curve is intentionally omitted; only observed samples are plotted.
- Full-view paired evidence:`/Users/zeng/Documents/New project/output/qiong-kiln-immersive-qa/comparison-final.jpg`.
- Focused paired evidence:`/Users/zeng/Documents/New project/output/qiong-kiln-immersive-qa/comparison-focus-final.jpg`, covering header/mode switch, status readings, and action console.
- Final desktop screenshot:`/Users/zeng/Documents/New project/output/qiong-kiln-immersive-qa/manual-final-1440.png`.
- Responsive evidence:`manual-1024.png`,`manual-768.png`,`manual-390.png` in the same QA folder. 1024x768,768x1024,390x844 tested; document widths were1024,768,375 respectively. Mobile scrollbar accounts for15px. Main controls and data remain available. 1024 panel/console do not overlap. On mobile the scene, operating console, status panel and AI settings are stacked in a deliberate reading order.

### Required fidelity surfaces

- Typography:strong Chinese sans heading, enlarged data numbers, bold three-mode switch and large action labels follow the reference hierarchy. Retained system sans fallback for local/offline use. Standard labels remain HTML and are selectable/accessibly named.
- Layout:full-bleed workshop, right cream status panel and centered bottom console match the selected composition. Earlier over-tall status panel was corrected by reducing readout spacing and chart height, and removing the duplicate visible status row. Header and console type/spacing were refined in a second pass.
- Color:cream/terracotta/forest palette and warm orange control accent retained; native button surfaces use solids, borders and shadows. Reduced-motion preferences are honored. Readable cream surfaces separate controls from the detailed image.
- Assets:two1600x1000 built-in-ImageGen workshop images recreate the supplied scene, with matching camera/layout in warm and cold variants. No code-drawn kiln or stand-in illustration remains. The existing typographic mark is retained. Standard symbols use locally bundled official Phosphor assets and their MIT license. The gauge and line graph are actual data visualizations.
- Copy:three modes and three operations preserved, zero-to100 heat remains a teaching index, source decorative prose is omitted where it could imply real firing expertise. Prototype banner is clearly visible. Current values, training curve and conclusions are not frozen mock text.

### Interaction and regression evidence

- Browser manual success:8steps,19energy; fixed rules run and30-seed batch test recorded.
- Real Q-learning:default3000-round training tested100% on30 held-out seeds; energy-penalty5 experiment tested0%, with both records preserved. Student report collected prediction, two written explanations and concept answer, then completed successfully in demo mode; no platform write was performed.
- Mobile heat button changed heat20→38; AI settings were visible and training enabled.
- Existing9 algorithm/platform tests passed, including failure retry, successful attachment reuse, duplicate submit protection and invalid launch rejection. Portable source/ZIP structural validation passed.
- Browser console checked after full completion:zero errors/warnings. All scene/icon image elements loaded successfully.

### Remaining P3 refinements

- Native controls have slightly flatter shading than the generated concept. One success/progress symbol uses the closest standard library check-circle instead of the concept's vase glyph.
- Background is a high-quality two-dimensional raster scene blended by heat, not a new3D physics engine. Fine material/lighting details can differ from the concept while preserving its composition.
- Formal student/teacher portal acceptance remains outside this local visual update; this is not a production deployment.

### Implementation checklist

- Resolved displayed option1 and backed up0.1.0 source.
- Installed real local scene assets and licensed icons.
- Rebuilt main composition and kept courseware contract/learning logic.
- Fixed P0 event propagation and P2 panel proportions; recaptured and compared.
- Verified primary flow, responsive layouts, tests and packaging.

## 1.0.0 platform acceptance, 2026-10-21

- The selected composition is retained. Latest actual platform capture is `output/qiong-kiln-v1-qa/local-1440.png` in the task workspace; heat70, energy17, step4, maturity2 follow the seeded engine.
- Found and fixed the platform-injected return link overlapping the brand. It now occupies a lower-left safe area; report/mobile pages reserve scrolling space. No platform-wide navigation change was made.
- Rechecked actual viewport sizes1440x900,1024x768,768x1024,390x844. Background tabs do not inherit the IAB viewport override, so final responsive captures use the visible test tab and confirm DOM dimensions. Preliminary captures named `local-manual-*` are superseded by `local-1440.png`, `local-1024.png`, `local-768.png`, `local-390.png`.
- Real local platform launch and full student interaction passed. Manual8steps/19energy; fixed30 tests100%; default3000 training100%; energy penalty5 training0%. An interrupted750-round training preserved its actual policy and83% test result.
- Intentional local API shutdown left the report retryable. Restarting only that API and retrying saved one completed100-point record plus two downloadable artifacts. JSON229.9KB included four real training experiments, Q tables, trajectories, reward settings and disjoint evaluation seeds.
- Teacher/student rendered record views show readable results. Default projection was verified in Chrome because the IAB did not expose the popup; its score, findings, reward explanation and artifact links render correctly. No platform frontend change was needed.
- Follow-up browser regression: overheat5steps and underfiring22steps recorded failures; all four reward sliders have accessible names. After training300rounds, selecting8000 for a future run and switching modes leaves the curve axis at300. Downloaded TXT identifies1.0.0 and actual/planned300/300rounds.
- Source, minimal ZIP and repository checks must remain passing at release. Production upload/acceptance is separately pending valid platform authentication; this local QA result does not claim deployment.

final result: passed

# Zhike Courseware Acceptance Checklist

Use this list as a delivery gate. Mark an item complete only after observing evidence.

## Metadata And Package

- [ ] `manifest.json` is valid JSON at the package root.
- [ ] `slug`, `title`, and `runtimeType` match the assigned values.
- [ ] `entry` starts with `/`; `nodePort` is `null` or an approved valid port.
- [ ] STATIC/BOTH has `static/index.html` or root `index.html`.
- [ ] NODE/BOTH has `server/package.json` or root `package.json`.
- [ ] ZIP is no larger than 80 MB and contains no symlink or parent-path entry.
- [ ] Package excludes `.git`, `.env*`, `node_modules`, logs, PIDs, local data, secrets, student data, and databases.
- [ ] Runtime assets are bundled locally; there is no unapproved CDN or hotlink dependency.

## Platform Contract

- [ ] Reads `launchToken`, `platformApiBase`, and `returnUrl` from the launch URL.
- [ ] Does not hardcode production domains, IP addresses, fixed ports, or identity values.
- [ ] Calls launch verification before formal interaction.
- [ ] Reports `STARTED`; uses `PROGRESS` only for meaningful milestones.
- [ ] Reports a finite `score` from 0 to 100 and a nonnegative integer duration.
- [ ] Uploads required work files before reporting `COMPLETED`.
- [ ] `summary` is structured, compact, displayable, and contains artifact URLs when needed.
- [ ] Teacher view, student view, and default projection can show the saved result.

## Save And Return

- [ ] Final save starts when the learning task completes, not only on one return button.
- [ ] The UI waits for artifact uploads and `COMPLETED` before showing success.
- [ ] Saving disables duplicate submission.
- [ ] Save failure stays on the page and offers a working retry.
- [ ] Retry preserves already uploaded items and retries only missing required items.
- [ ] Every normal completion exit preserves the saved result.
- [ ] Navigation-only platform controls are not treated as save controls.

## Interaction And Reliability

- [ ] Retry resets score, question/round index, timer, selections, generated state, and save flags.
- [ ] Randomized content actually rotates across fresh runs when the design requires it.
- [ ] The UI never shows `NaN`, `undefined`, raw JSON, source code, or stack traces.
- [ ] Fast repeated clicks do not create duplicate saves or paid generation requests.
- [ ] Loading, empty, permission-denied, network-error, save-error, and partial-result states are complete.
- [ ] Multi-result generation reports partial status and never marks an incomplete set complete.

## Devices And Privacy

- [ ] Visually checked at 1440x900, 1024x768, 768x1024, and 390x844.
- [ ] Touch targets work without hover; controls, canvas, text, and results do not overlap or clip.
- [ ] iPad Safari does not reveal source fragments or overflow hidden content.
- [ ] Camera/microphone allow, deny, interrupt, and cleanup behavior is tested when relevant.
- [ ] No secret, launch token, personal data, or full sensitive model response appears in logs.

## Delivery Evidence

- [ ] Portable validator passes for the source folder and final ZIP.
- [ ] Canonical repository tests and secret scan pass when applicable.
- [ ] Final ZIP SHA-256 and source revision/version are recorded.
- [ ] Known limitations are written plainly.
- [ ] Production deployment occurs only after explicit authorization.


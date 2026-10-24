# Resume Playwright coverage work

Last updated: **2026-10-24**. This is the working handoff; update it after each
coverage batch. Scenario IDs and acceptance details live in the
[catalog](scenario-catalog.json) and [coverage report](coverage.md).

## Current checkpoint

Branch at handoff: `codex/playwright-behavioral-baseline`.

| Commit     | Completed work                                                                         |
| ---------- | -------------------------------------------------------------------------------------- |
| `55c3d7e4` | Initial full-stack behavioral regression baseline                                      |
| `2f20b96c` | Expanded behavior contracts and added the tracked scenario inventory/report            |
| `30893093` | Five more tests for mission defaults, lander cascades, POI links and folder visibility |

At `30893093`, **85/253 eligible scenarios (33.6%)** are fully mapped, including
**50/146 P0 scenarios (34.2%)**. There are **159 gaps, nine partial mappings and
seven external scenarios**. The denominator was preserved. These are reviewed
scenario mappings, not JavaScript line coverage.

The last confirmation run passed **106 cases with no failures, skips or retries**:
97 Chromium behavior cases, four Firefox smoke cases, four WebKit smoke cases
and authentication. TypeScript, scoped ESLint, formatting and report freshness
also passed. The complete legacy imported-mission/map suites were not run.
See the [validation record](runs/2026-10-24-behavior.md) for commands and evidence.

Latest closed IDs: `CFG-003`, `CFG-004`, `FOLDER-003`, `POI-007`. Their tests are
in [missionDefaults.spec.ts](../../src/tests/playwright/behavior/missionDefaults.spec.ts),
[folders.spec.ts](../../src/tests/playwright/behavior/folders.spec.ts) and
[poiLinks.spec.ts](../../src/tests/playwright/behavior/poiLinks.spec.ts).
There is no partially implemented test from this batch to finish.

## Start here next time

1. Read this handoff, inspect `git status --short` and `git log -3 --oneline`, and
   preserve any newer work. The counts above are a checkpoint, not a substitute
   for checking the current catalog.
2. Run `npm run test:playwright:scenarios`. This validates discovery and generated
   documentation without starting the application or database.
3. Take the folder lifecycle/membership batch below, or choose the critical
   position batch if prioritizing P0 coverage. Read each catalog row's complete
   action/expected outcome before implementing it.
4. Use isolated behavioral fixtures and UI actions; run the focused cases, review
   their complete scenario mappings, then regenerate and validate the report.
   Record browser results separately from discovery results.

## Next bounded coverage batch

**Suggested first work: `FOLDER-001` and `FOLDER-002`**, extending the existing
folder spec and reusing its setup/peer/map observation patterns.

| Scenario     | Work to implement                                                                                                                                                                                                                                                      | Starting sources                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FOLDER-001` | Parameterize create/rename/validation/Cancel/delete across POI, station, EVA and preset folders; verify persisted entities and membership after reload. Exercise populated-folder deletion rejection, then empty-folder confirmation and cancellation.                 | `src/components/interface/folders.tsx`, `src/components/interface/form/globalFields.tsx`, `src/operations/op-folder.ts`, `src/store/thunk/thunkFolder.ts` |
| `FOLDER-002` | Exercise real pointer dragging into folders, between folders and back to root; assert each UUID occurs exactly once in the intended membership, including peer and reload. Check which list types actually support reordering before claiming that portion of the row. | `FolderOrganizer` in `src/components/interface/folders.tsx`, `src/operations/apply/apply-mission-folder.ts`                                               |

Known starting details: the four planning lists expose `addFolder`; folder names
use the inline editor labeled `Drag/drop items to folder`; menus expose Rename
Folder and Delete Folder. `opDeleteFolder` currently **rejects folders containing
live entities**, with `Cannot delete folder with items in it`. Do not assume a
populated folder can be deleted while retaining its entities. Test that guard
and the empty-folder path, and clarify the catalog's broad “delete empty and
populated folders” wording against the reviewed behavior. UI validation must be
proved by attempting Save and checking persisted state, not merely by seeing
an error message. These lifecycle/drag/validation paths have not been exercised
by the new visibility tests.

After that batch, prioritize these uncovered families:

| Priority | Scenarios                      | Fixture/work needed                                                                                                                                                                                                                                             |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | `POSITION-001`, `POSITION-002` | Use the execution seed and fixed Date pattern to prove PET captured at New Pos, placement coordinates, source/type drafts and the distinct map-finish/Save/Cancel boundaries. Start with `map-menu-pos.tsx`, `map-menu-pos-menu.tsx` and `thunkRexPosEntry.ts`. |
| P0       | `AUTH-002`, `AUTH-003`         | Add distinct viewer/editor sessions with explicit mission grants. The current global authentication account is a super-admin, so it cannot prove permission or cross-mission enforcement. Cover both UI and direct transports required by each row.             |
| P0       | `MEASURE-003`, `MEASURE-004`   | Reuse the real DEM installation pattern, add independently known profile expectations and delayed stale responses/mission switching. The lander test's elevation assertion does not close profile rendering or ordering scenarios.                              |

The full backlog remains in the catalog. Do not promote broad rows based on a
subset of their outcomes, or remove gaps to raise the percentage.

## Commands and environment

Work from the repository root with dependencies/browser binaries installed, the
normal local environment configured and PostgreSQL/schema/migrations ready.
Tests start the API and Vite on ports 4001/4000 when needed. The lander DEM setup
uses `STATIC_DIR` and creates only its isolated mission's files; fixture teardown
removes them. No imported operational mission is needed for `behavior/` tests.

On this Windows/npm setup, forwarded `npm run ... -- --grep ... --repeat-each ...`
flags were misparsed. Use Playwright's CLI directly for focused filters, projects
and repeats; check the discovered count to verify the requested scope.

```powershell
# Focused folder work; choose a fresh report directory per run.
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/folders-next'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior/folders.spec.ts --project=chromium --trace=retain-on-failure

# Full behavior regression plus the configured Firefox/WebKit smoke suites.
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/next-confirmation'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --trace=retain-on-failure

# After reviewing and editing scenario-catalog.json:
npm run docs:playwright-scenarios
npm run test:playwright:scenarios
npm run tsc
npx eslint src/tests/playwright/behavior
git diff --check
```

`npm run test:playwright:scenarios:complete` deliberately fails while the tracked
gaps/partial rows remain. It is not the normal green validation gate.

## Reuse these fixtures and lessons

- [behavioralTest.ts](../../src/tests/playwright/fixtures/behavioralTest.ts)
  creates, schema-validates, reads and deletes isolated missions. Use
  `mission.change()` only to arrange the fixture; perform tested mutations
  through the UI. `mission.read()` supplies persisted-state assertions.
- [missionSeed.ts](../../src/tests/playwright/fixtures/missionSeed.ts) and
  [entitySeeds.ts](../../src/tests/playwright/fixtures/entitySeeds.ts) provide
  explicit IDs, plan relationships and execution variants.
- [planningHelpers.ts](../../src/tests/playwright/behavior/planningHelpers.ts)
  selects stations/POIs/EVAs idempotently. Clicking an already selected row
  directly can deselect it; use direct clicks only when testing that behavior.
  Some checkbox inputs expose the generic accessible name `checkbox`; POI link
  tests scope the real input by its entity ID.
- [mapAssertions.ts](../../src/tests/playwright/fixtures/mapAssertions.ts)
  observes actual OpenLayers features. Call `installMapObserver(peer)` before
  navigating a peer that needs map assertions; the main fixture page already
  installs it. DOM assertions and real gestures still establish the user flow.
- The lander test copies the Apollo 14 raster extract into its own mission
  directory and checks a GDAL golden value through the real terrain API/worker.
  When arranging Automerge objects, copy point values before inserting them in
  a second location; inserting an existing document proxy raises a RangeError.
- Mission traverse/walkback rates can be inherited. Default EVA duration is
  copied on creation; changing it does not rewrite existing EVA durations.
- Folder visibility is shared, while selection/expansion are local. A selected
  EVA keeps its sequence stations visible even when their folder is hidden.

## Unresolved readiness issue and retained evidence

One earlier full run failed the existing test **“duplicating an EVA shares
planned stations but owns new traverses”** after its data assertions, on reload:
the page stayed at “Loading mission data…” past the 10-second header assertion.
The complete planning-file recheck and the final 106-case run passed. Root cause
is unconfirmed; no timeout increase, automatic retry or production fix was made.
If it recurs, retain the trace and inspect authentication/version handshake,
Automerge readiness and `populateStore` before changing waits.

For a focused repeated investigation:

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/reload-investigation'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior/planning.spec.ts --project=chromium --grep="duplicating an EVA shares" --repeat-each=3 --trace=retain-on-failure
```

Local, Git-ignored evidence retained on this checkout:

| Directory/log                                                                   | Evidence                                                                                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.local/playwright/reports/confirmed/`, `.local/playwright-confirmed.log`       | Final 106 passes                                                                                                                                      |
| `.local/playwright/reports/final/`, `.local/playwright-final.log`               | Initial 105 passes plus the reload timeout                                                                                                            |
| `.local/playwright/reports/reload-check/`, `.local/playwright-reload-check.log` | 18 planning cases plus authentication passed; this was not a three-repeat run because npm misparsed the forwarded flags                               |
| `.local/playwright/reports/mutations/`, `.local/playwright-mutations.log`       | Both intended failures when folder filtering and lander-copy relocation were temporarily broken; production sources were restored before confirmation |

These local reports may not exist on a fresh checkout; the committed validation
record preserves the findings. At the end of the next batch, update this handoff's
checkpoint, counts, closed IDs, remaining first task and unresolved issues; add
a run record with actual scope/results and commit the reviewed tests/catalog/docs.

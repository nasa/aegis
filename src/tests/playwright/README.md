# AEGIS browser behavior contracts

For the scenario catalog, coverage report and maintenance commands, start with the
[scenario coverage guide](../../../docs/testing/README.md).

The `behavior/` suite describes observable application behavior across states and
transitions. It runs the actual React application, API, PostgreSQL persistence,
and Automerge synchronization. Each test owns a small mission; it does not depend
on imported missions 22 or 47 or an execution happening to be running.

## Run

Use a local development database and the normal application environment. The
configuration starts the application if it is not already running. Database
schema and migrations must already be current, as for normal local development.

```sh
npm run test:playwright:behavior
npm run test:playwright:smoke
```

The first command runs the behavioral contracts in Chromium. The second runs the
small functional smoke set in Chromium, Firefox, and WebKit. Browser binaries must
be installed (`npx playwright install`). For a focused capability:

```sh
npm run test:playwright -- behavior/execution.spec.ts --project=chromium
npm run test:playwright -- behavior/mapEditing.spec.ts --project=chromium
npm run test:playwright -- behavior/planning.spec.ts --project=chromium
npm run test:playwright -- behavior/collaboration.spec.ts --project=chromium
npm run test:playwright -- behavior/actions.spec.ts --project=chromium
npm run test:playwright -- behavior/reports.spec.ts --project=chromium
npm run test:playwright -- behavior/configuration.spec.ts --project=chromium
npm run test:playwright -- behavior/calculations.spec.ts --project=chromium
npm run test:playwright -- behavior/executionPolicy.spec.ts --project=chromium
npm run test:playwright -- behavior/exports.spec.ts --project=chromium
npm run test:playwright -- behavior/navigation.spec.ts --project=chromium
npm run test:playwright -- behavior/poiLifecycle.spec.ts --project=chromium
npm run test:playwright -- behavior/poiLinks.spec.ts --project=chromium
npm run test:playwright -- behavior/folders.spec.ts --project=chromium
npm run test:playwright -- behavior/missionDefaults.spec.ts --project=chromium
npm run test:playwright -- behavior/positions.spec.ts --project=chromium
npm run test:playwright -- behavior/transportRecovery.spec.ts --project=chromium
npm run test:playwright -- behavior/actionParentMatrixCoverage.spec.ts --project=chromium
npm run test:playwright -- behavior/actionTemplateRoundTripCoverage.spec.ts --project=chromium
npm run test:playwright -- behavior/calculationBoundaries.spec.ts --project=chromium
npm run test:playwright -- behavior/celestialPresetCoverage.spec.ts --project=chromium
npm run test:playwright -- behavior/dashboardFollowCoverage.spec.ts --project=chromium
npm run test:playwright -- behavior/mapLifecycleHandoff.spec.ts --project=chromium
```

The existing `test:playwright` and CI sharding commands also discover these tests.
Legacy mission/configuration and map smoke tests remain available. Playwright
does not become a dependency of container image builds or production deployment.

## Before merging

Run affected tests locally while developing. When you think the MR is ready to
merge, push the final changes and manually click Play once on
`test-playwright:start` in that commit's GitLab pipeline. This releases all eight
shards automatically. Together they run the full configured suite: authentication
setup, Chromium regression tests, and Firefox/WebKit smoke and selected parity
workflows. Full Playwright execution is not required on every development push.

Keep the MR in Draft until every shard and the other required pipeline checks
pass. Record the tested commit, pipeline link, and any retries or skipped tests
in the MR description, and check the full Playwright suite checkbox in the
[MR template](../../../.gitlab/merge_request_templates/Default.md). Investigate
failures and retries; a filtered run is not full-suite evidence. A duplicate full
local run is optional; `npm run test:playwright` without filters or sharding is
available for diagnosis. `npm run test:all` does not run Playwright.

New commits invalidate the recorded result and checkbox. Return the MR to Draft
and trigger a fresh full CI run when the updated candidate is ready, including
after incorporating target-branch changes. Update tests and scenario mappings
for changed behavior, regenerate the coverage docs, and run
`npm run test:playwright:scenarios:complete` before acceptance. See
[Before Finishing a Merge Request](../../../CLAUDE.md#before-finishing-a-merge-request).

## Coverage by capability

The [tracked scenario inventory and coverage report](../../../docs/testing/README.md)
expand this overview into stable scenario IDs, explicit expected outcomes,
exact test mappings, partial evidence and gaps across the whole application.
Run `npm run test:playwright:scenarios` to validate the report against current
discovery, or `npm run docs:playwright-scenarios` after updating its catalog.
The report measures scenario-to-test mapping; actual browser results remain a
separate acceptance requirement.

| Capability                         | Contract examples                                                                                                                                                          | Specification                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Application entry and navigation   | Known mission identity, complete seeded domain relationships, no-execution dashboard, active dashboard and minimap                                                         | `behavior/smoke.spec.ts`           |
| Navigation and version recovery    | Direct editor/dashboard links, home/back/forward, deployment mismatch, refreshed mission and current-version redirect                                                      | `behavior/navigation.spec.ts`      |
| Mission preferences                | Save/Cancel, peer/header updates, reload, new EVA defaults, text limits, numeric filtering and optional signed/zero/cleared values                                         | `behavior/configuration.spec.ts`   |
| Mission defaults and lander        | Inherited rates, independent overrides, new versus existing EVA durations, DEM elevation, lander copies, boundary traverses, walkbacks, peer and reload                    | `behavior/missionDefaults.spec.ts` |
| Numeric calculations               | Independent crew/work/dwell totals, incomplete crew warning, 500 m rate precedence, zero/unset fallback, sequence/EVA totals and exported movement minutes                 | `behavior/calculations.spec.ts`    |
| Execution time ownership           | Selected stopped execution, another active execution, A/B/A switching, planned scope, frozen paused clock, ticking clock, zero and hour boundaries                         | `behavior/execution.spec.ts`       |
| Execution controls                 | Start/pause/resume/stop, interlock against simultaneous execution, manual PET validation/cancel, reset confirmation and persistence, dashboard synchronization             | `behavior/execution.spec.ts`       |
| Execution edit policy and values   | First-start policy/baseline freeze, restart/reload, limited original-action protection, status lifecycle in sequence/station/EVA views, peer merges and Maestro sample IDs | `behavior/executionPolicy.spec.ts` |
| Execution positions                | Captured ticking/paused PET, source/type drafts, map placement versus Save, both Cancel paths, deletion confirmation, exact history/markers/paths, peer and reload         | `behavior/positions.spec.ts`       |
| Planning and entity lifecycle      | Name and numeric validation, save/cancel, create/duplicate/delete, shared station protection, independent execution copies, deletion cascades, actual export content       | `behavior/planning.spec.ts`        |
| POI creation and deletion          | UI-created defaults/identity, blank/duplicate/overlong names, boundary-length save, deletion Cancel, adopted-copy cleanup and unrelated-action preservation                | `behavior/poiLifecycle.spec.ts`    |
| POI station links                  | Multiple station links, usage counters, navigation, unlink, peer updates, reload and source-action ownership                                                               | `behavior/poiLinks.spec.ts`        |
| Folder visibility                  | Shared hide/show, local selection exceptions, EVA scope, collapse/expand, reload and unchanged folder membership                                                           | `behavior/folders.spec.ts`         |
| Downloaded export contents         | Every category alone, all/empty selections, filenames, nested relationships, plan/REX lineage and sample values, position GeoJSON, Unicode and null/zero distinctions      | `behavior/exports.spec.ts`         |
| Action planning                    | View/edit protection, required fields and Cancel, duration/crew totals, deactivate/reactivate, independent duplicates, delete confirmation, parent ownership and reload    | `behavior/actions.spec.ts`         |
| EVA comparison reports             | Exact plan counts and minutes, signed baseline differences, station breakdowns, live updates from another page, reload, read-only mission data                             | `behavior/reports.spec.ts`         |
| Map representation and preferences | Exact label values, label visibility and changed pixels, selected hidden POI exception, marker click selection, local preference persistence                               | `behavior/mapEditing.spec.ts`      |
| Geometry edits                     | Interior vertex drag, finish/cancel distinction, endpoint pinning, straight-path reset, editing interaction removal on navigation, persisted paths                         | `behavior/mapEditing.spec.ts`      |
| Dashboard/minimap consistency      | Shared scale-bar toggles and persistence, minimap limited to the active execution                                                                                          | `behavior/dashboardMap.spec.ts`    |
| Collaboration                      | Two real browser contexts, live changes, independent local selection, concurrent unrelated edits, canceled edits, creation/deletion, late joining, disconnect/reconnect    | `behavior/collaboration.spec.ts`   |

## Fixtures and isolation

Import `test` and `expect` from `fixtures/behavioralTest.ts`. The `mission` fixture:

1. Creates a blank mission through the authenticated application API.
2. Seeds explicit entities through the real Automerge WebSocket with the current
   server epoch, then waits for an authoritative server read to match.
3. Supplies `mission.open(page)`, stable IDs, and `mission.read()` for independent
   persistence assertions.
4. Deletes exactly that mission, including after a test failure.

`mission.change()` is for arranging a scenario, not performing the action being
tested. Use real UI input for that action. `test.use({ scenario: "execution" })`
adds a stopped Alpha execution and an active, paused Bravo execution with
deliberately different times and positions. Defaults are obtained from the
server-created blank mission; the small entity fixtures are explicitly defined
in `fixtures/entitySeeds.ts` and `fixtures/missionSeed.ts`.

The fixture refuses non-local server URLs. Authentication creates a distinct test
account per run and deletes only that account. Failure reports include the
isolated mission state, screenshots, and retry traces. Do not run these tests
against production or point the local server at a production database.

## Meaningful expectations

Assertions should specify expected user outcomes with independently known values.
For example, stopped PET `+02:10:05` minus a position recorded at `+01:55:05` must
display age `+00:15:00`, even while another execution is running at `+00:05:00`.
Do not call the application's age calculator to derive the expected age.

DOM assertions check visible controls and values. Canvas assertions use a
development-only `aegis:map-ready` event to observe the real OpenLayers sources;
the observer neither changes features nor calculates replacement label values.
Label toggle tests additionally compare screenshots from the same browser run.
Source assertions establish the data supplied to rendering; they do not establish
pixel-perfect text appearance, clipping, or contrast. There are no automatically
accepted screenshot baselines.

Time-travel scenarios fix the browser's Date before navigation while leaving
native timers and animation frames running, so sockets and rendering continue.
They neutralize AEGIS's server-time offset updates only within those scenarios;
they do not test server clock-skew correction. Advancing the fixed Date avoids
real minutes of waiting. Frozen-clock assertions also observe elapsed native
time spanning multiple clock ticks before checking that the value stayed fixed.

## Extending the specification

- Name the capability, relevant state/transition, and expected outcome first.
- Create its required data explicitly. Missing prerequisites should fail setup;
  never skip an assertion or action because imported data is absent.
- Exercise meaningful state combinations: planned/executing/historical,
  selected/unselected, editable/read-only, local/another client, and reload.
- Prefer a bounded scenario with one clear contract over a giant chained tour.
- Use retrying assertions against observable state instead of fixed sleeps.
- Check persistence and relationships, not just success messages or a visible
  canvas. Use a second client when synchronization is part of the contract.
- When a defect is found, broaden its capability's state matrix and retain the
  reproducer as an example. Keep fast unit/component tests when they provide
  useful diagnosis; browser tests establish that the pieces work together.
- Demonstrate detection: the test must fail when its target behavior is broken.
  For the historical POS-age case, removing the selected REX from
  `MarkerLabels`'s `useRexPetTime` call should fail the stopped-execution
  scenario even if the hook's unit tests still pass.

Keep the scenario catalog and generated coverage documentation current when
adding a new capability. The reviewed inventory has 253/253 eligible scenarios
mapped at the 2026-10-25 checkpoint, including server restart, distinct-user
permissions, execution, report and GIS contracts. Test counts and mapping
coverage do not establish exhaustive state coverage. Review new capabilities
and material state boundaries with explicit expected outcomes and fixtures;
do not limit the inventory to preserve its percentage.

The reconnect contract takes one browser context offline, verifies that editing
cannot be enabled and that a server-persisted peer edit has not arrived, then
restores connectivity. It requires catch-up without navigation, a successful edit
back to the original client, and persistence after reload. It does not establish
offline editing or recovery after the server's epoch changes. The separate
`behavior/collaborationDurability.spec.ts` tests cover real API restart durability,
stale-epoch rejection, and recovery with a fresh document.

Comparison report tests explicitly enable action system v2 with empty definition
dictionaries so startup audits do not insert default definitions during the test.
Expected report values come from the fixture's known station sequence and action
duration, rather than the application's report calculators.

Mission-default tests distinguish inherited traverse/walkback rates from the EVA
duration default copied when an EVA is created. The lander relocation contract
copies the checked-in Apollo 14 DEM extract into the isolated mission's static
directory and uses its independently recorded GDAL elevation. It exercises the
real terrain API and raster worker; fixture cleanup deletes that mission's copy.
Folder tests observe real marker sources on two clients, including selection and
EVA exceptions to hidden folders. POI link tests check counters, navigation and
unchanged action ownership across link/unlink, peer updates and reload.

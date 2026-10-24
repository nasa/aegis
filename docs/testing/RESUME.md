# Resume Playwright coverage work

Last updated: **2026-10-24**. Complete acceptance details live in the
[catalog](scenario-catalog.json) and generated [coverage report](coverage.md).

## Current checkpoint

Branch: `codex/playwright-behavioral-baseline`. This working-tree batch follows
`e3fb7de0`; no new commit was created.

**Added 111 Chromium behavior cases** across 28 new spec files and extensions
to folders/positions. Three Luna subagents worked in successive parallel batches;
the coordinator added tests, reviewed assertions/mappings and ran final validation.
No production source or Playwright configuration was changed.

| Measure                              | Before         | Current             |
| ------------------------------------ | -------------- | ------------------- |
| Complete eligible scenarios          | 88/253 (34.8%) | **129/253 (51.0%)** |
| Complete P0 scenarios                | 52/146 (35.6%) | **71/146 (48.6%)**  |
| Chromium behavior cases              | 102            | **213**             |
| Combined browser run, including auth | 111            | **222 passed**      |

There are **115 gaps, nine partial mappings and seven external scenarios**.
The 260-row inventory and 253-scenario denominator are unchanged. Percentages
measure reviewed complete scenario mappings, not JavaScript line coverage.
Partial rows receive no credit. Firefox/WebKit run their four smoke cases each;
the complete behavioral matrix runs in Chromium.

Final confirmation: **222/222 passed with three workers, zero retries and zero
skips**. TypeScript, scoped ESLint, Prettier, generated-report freshness and
`git diff --check` also passed. See the
[validation record](runs/2026-10-24-expanded-coverage.md) for commands, scope,
development failures and retained evidence.

### Newly completed scenario mappings

| Area                                                     | Scenarios                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Application entry and navigation                         | `APP-003`, `APP-006`                                                      |
| Authentication, permissions and connection gates         | `AUTH-001`                                                                |
| Mission reference data and templates                     | `REF-001`, `REF-003`, `REF-005`, `REF-006`, `REF-007`, `REF-008`          |
| Folders, ordering and shared lists                       | `FOLDER-001`, `FOLDER-002`                                                |
| POI lifecycle and association                            | `POI-006`                                                                 |
| Station lifecycle and properties                         | `STATION-010`, `STATION-011`, `STATION-014`, `STATION-015`, `STATION-016` |
| EVA sequence editing and plan identity                   | `EVA-009`, `EVA-010`, `EVA-011`                                           |
| Action editing, reuse and ownership                      | `ACTION-008`, `ACTION-011`                                                |
| Measurements and terrain profiles                        | `MEASURE-002`, `MEASURE-008`                                              |
| Presets, layers and GIS display                          | `PRESET-001`                                                              |
| Execution lifecycle and PET ownership                    | `REX-021`, `REX-022`, `REX-023`, `REX-024`                                |
| Execution position entry, types and sources              | `POSITION-004`, `POSITION-005`, `POSITION-007`                            |
| Execution dashboard, follow and minimap                  | `DASH-009`                                                                |
| Legacy STM and v2 satisfaction rules                     | `STM-003`, `STM-004`                                                      |
| Comparison, STM coverage, campaigns and POI traceability | `REPORT-004`, `REPORT-005`, `REPORT-006`, `REPORT-012`                    |
| Collaboration, persistence and recovery                  | `COLLAB-007`, `COLLAB-009`                                                |

Mappings cover actual supported controls. Catalog wording explicitly records
that folders support membership rather than row reordering; report columns use
automatic family ordering and client-local preferences that reset on reload;
campaigns have no duplicate/manual-drag control; priorities contain trace/category
rather than color/manual-order fields; STM rule edits save immediately without a
duplicate control. These features are not claimed as tested or implemented.

### Important remaining boundaries

- `POSITION-006`: source filtering, equal-PET ordering, historical source/path/age
  checks and planned clearing are covered; the complete marker-type matrix remains.
- `ACTION-010`: saved/canceled station text is covered; icon/parent-specific fields
  and aggregate-card coverage remain.
- `REX-027`: deletion ownership and fresh-page recovery pass. Live plan-detail
  fallback after remote deletion can leave an empty panel/stale dropdown until reload.
- `REPORT-003`: 22 independently calculated metric rows across four baselines pass.
  A mathematically equal travel delta can display negative zero from floating-point
  roundoff; the row remains partial.
- `COLLAB-008`: server snapshots during EVA duplication are checked, but the full
  operation matrix and every browser document transition are unproved.
- `EVA-006` remains partial: an already-open editing peer can republish its stale
  UTC date/time over the saved author's value. The passing case explicitly uses one
  editor and a read-only peer; the failing two-editor trace is retained for follow-up.

## Start here next time

1. Read this handoff, `git status --short` and recent history; preserve newer work.
   The catalog supersedes these checkpoint counts.
2. Run `npm run test:playwright:scenarios` for discovery/report freshness. It runs no
   browser cases. Read the full action/expected outcome before choosing a row.
3. Use isolated fixtures and real UI mutations; assert authoritative persistence,
   independently known downstream values and required peer/reload behavior.
4. Run focused cases, review mappings, regenerate reports and run combined browser
   confirmation. Update this handoff and add a validation record.

## Next bounded batch

| Priority | Scenarios                    | Remaining work                                                                                                  |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P0       | `AUTH-002`, `AUTH-003`       | Viewer/editor enforcement through UI, API and Automerge; selector tests alone do not prove mutation permissions |
| P0       | `POSITION-006`               | Complete marker-type/source/path/age combinations across active/historical/planned scopes                       |
| P0       | `REX-027`                    | Investigate stale local selection and prove automatic safe plan fallback after historical deletion              |
| P0       | `REPORT-003`                 | Signed-zero equality boundary; retain independent expected metrics                                              |
| P0       | `COLLAB-008`                 | Full duplicate/delete graph matrix observed in peers as well as authoritative snapshots                         |
| P0       | `MEASURE-003`, `MEASURE-004` | Independent real DEM heights and stale/delayed-response rejection across missions                               |
| P1       | `EVA-006`                    | Fix two-editor UTC rollback, then prove saved date/time stays converged without stale local writes              |
| P1       | `FOLDER-004`                 | Overlapping move/delete operations with unique valid memberships on both clients                                |

Do not promote a broad row from a subset of passing outcomes or change a denominator
to increase the percentage. Unsupported operations must stay explicit.

## Commands and environment

Use dependencies/browser binaries, the normal local environment and PostgreSQL
schema/migrations. The configured server starts API/Vite on 4001/4000 when needed;
concurrent runs can share one local server with separate report/output directories.
Tests create/delete isolated missions and need no imported operational mission.
Real DEM tests use `STATIC_DIR` and clean up only their own mission files.

Windows npm forwarding previously misparsed grep/repeat flags. Use the direct CLI
and verify its discovered test count:

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/next-confirmation'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --output=.local/playwright/next-confirmation-results --trace=retain-on-failure

npm run docs:playwright-scenarios
npm run test:playwright:scenarios
npm run tsc
npx eslint src/tests/playwright/behavior
npx prettier --check src/tests/playwright/behavior docs/testing/RESUME.md docs/testing/runs/2026-10-24-expanded-coverage.md
git diff --check
```

`test:playwright:scenarios:complete` intentionally fails while gaps/partials remain;
it is not the normal green validation gate. Legacy imported-mission/map suites
were not part of this batch's executed scope.

## Reuse these fixtures and lessons

- [behavioralTest.ts](../../src/tests/playwright/fixtures/behavioralTest.ts) creates,
  schema-validates, reads and deletes isolated missions. `mission.change()` arranges
  data only; tested mutations use UI. Later arrangements bypass initial schema
  validation: adding unsupported fields can break peer hydration. An invalid extra
  POI refUuid caused a development spinner and was removed from the test fixture.
- [missionSeed.ts](../../src/tests/playwright/fixtures/missionSeed.ts) and
  [entitySeeds.ts](../../src/tests/playwright/fixtures/entitySeeds.ts) supply explicit
  plan/execution relationships. Use valid UUIDs and copy Automerge proxy values
  before inserting them into another location.
- [planningHelpers.ts](../../src/tests/playwright/behavior/planningHelpers.ts)
  selects entities idempotently. Clicking a selected row can deselect it. Clicking
  a POI in Station POIs toggles its association; use actual POI navigation to inspect
  POI totals. Running executions can add another left title, so scope navigation.
- [mapAssertions.ts](../../src/tests/playwright/fixtures/mapAssertions.ts) observes
  real OpenLayers features. Install the observer on peers before navigation. Check
  independent projected distances, style values and rendered canvases where needed.
- Folder dragging: wait for the previous DragOverlay to disappear, hover the source,
  move beyond the five-pixel activation threshold, assert dragging, recompute target
  bounds and assert droppable before mouse-up. The name editor has a known 50 ms
  debounce; tests advance a controlled clock 51 ms before valid Save.
- Position menus can overlap controls: move them with real pointer dragging. Wait
  for map animation before placement. Default filters show Task/Crew; choose All
  for Rover. New Pos captures PET before placement; existing marker movement commits
  coordinates separately from metadata Save. Cancel boundaries must be asserted.
- Concurrent position and same-field metadata saves can choose either submitted
  winner. Wait for server/both UIs to agree, then capture the result; do not require
  a particular winner or field-level merging. Preserve unrelated exact records.
- Real Apollo14 DEM tests check a known elevation through the real terrain API and
  worker. STM rule summaries include disabled actions, while EVA coverage excludes
  them; the tests record both independently rather than assuming identical counts.

## Retained readiness history and evidence

An earlier baseline run timed out on “Loading mission data…” after duplicating
an EVA and reloading. Its planning recheck and later 106-case confirmation passed.
This batch also reproduced a ten-second initial-load spinner in one report-matrix
variant before any report assertion; the other identical fixture variants passed.
The retained trace records an Automerge WebSocket ERR_NO_BUFFER_SPACE, a later
reconnect, then Document unavailable while ordinary API calls succeeded. This
points to a transient socket/recovery failure rather than a metric assertion;
the underlying cause remains unconfirmed. Do not hide it with automatic retries
or blanket timeout increases.

| Local Git-ignored evidence                                                                                          | Meaning                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.local/playwright/reports/expanded-final-verified/`, `.local/playwright-expanded-final-verified.log`               | Final 222-case combined result                                           |
| `.local/playwright/reports/expanded-final-confirmation/`, `.local/playwright-expanded-final-confirmation.log`       | Earlier 222-case pass before final cross-review assertions               |
| `.local/playwright/reports/expanded-reviewed-confirmation/`, `.local/playwright-expanded-reviewed-confirmation.log` | Combined run exposing UTC rollback and an initial-load readiness timeout |
| `.local/playwright/reports/expanded-confirmed/`, `.local/playwright-expanded-confirmed.log`                         | First-wave 141 passes/one incomplete folder gesture                      |
| `.local/playwright/reports/folder-drag-repeat/`                                                                     | Corrected station drag passed three repeats plus auth                    |
| `.local/playwright/reports/report-expanded/`, `.local/playwright/report-expanded-results/`                          | Signed-zero equality development evidence                                |
| `.local/playwright/reports/positions-confirmed/`, `.local/playwright-positions-confirmed.log`                       | Previous position-batch confirmation                                     |
| `.local/playwright/reports/confirmed/`, `.local/playwright-confirmed.log`                                           | Earlier 106-case confirmation                                            |
| `.local/playwright/reports/positions-mutations/`, `.local/playwright/reports/mutations/`                            | Prior batches' deliberate mutation checks, restored before confirmation  |

No production mutations were performed in this batch. Local reports may be absent
on a fresh checkout; committed validation records preserve the findings.

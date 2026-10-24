# Expanded Playwright validation — 2026-10-24

Working-tree batch following `e3fb7de0` on
`codex/playwright-behavioral-baseline`; no new commit. Windows, Playwright 1.63.0,
local Vite/API/PostgreSQL/Automerge. Three Luna subagents worked in successive
parallel batches while the coordinator added tests and reviewed evidence.

## Scope and mapping result

**111 new Chromium behavior cases**, from 102 to 213. Complete scenario mappings
increased **88/253 (34.8%) → 129/253 (51.0%)**; P0 increased
**52/146 (35.6%) → 71/146 (48.6%)**. There are 115 gaps, nine partial rows and
seven external scenarios. The 260-row inventory/253 eligible denominator is
unchanged. Partial rows earn no credit; this is scenario mapping, not line coverage.

Twenty-eight new specs and two extended specs contribute:

| Spec                                       | Added Chromium cases |
| ------------------------------------------ | -------------------- |
| `folders.spec.ts`                          | 8                    |
| `positions.spec.ts`                        | 3                    |
| `actionAdoption.spec.ts`                   | 3                    |
| `authEntry.spec.ts`                        | 10                   |
| `campaignFallback.spec.ts`                 | 2                    |
| `campaignLifecycle.spec.ts`                | 2                    |
| `collaborationAtomicGraphCoverage.spec.ts` | 1                    |
| `collaborationDeleteDraftCoverage.spec.ts` | 4                    |
| `dashboardHandoverCoverage.spec.ts`        | 1                    |
| `evaBoundaryLifecycle.spec.ts`             | 3                    |
| `evaDeleteOwnership.spec.ts`               | 1                    |
| `evaMetadataLifecycle.spec.ts`             | 1                    |
| `executionCoverage.spec.ts`                | 12                   |
| `measurementLifecycle.spec.ts`             | 4                    |
| `missionPriorities.spec.ts`                | 1                    |
| `poiMetadata.spec.ts`                      | 6                    |
| `positionHistoryFilterCoverage.spec.ts`    | 1                    |
| `positionTypes.spec.ts`                    | 1                    |
| `presetLifecycle.spec.ts`                  | 1                    |
| `referenceCircles.spec.ts`                 | 1                    |
| `referenceData.spec.ts`                    | 4                    |
| `reportColumns.spec.ts`                    | 2                    |
| `reportMatrix.spec.ts`                     | 6                    |
| `rexMetadata.spec.ts`                      | 3                    |
| `sameFieldConflictCoverage.spec.ts`        | 2                    |
| `stationCircles.spec.ts`                   | 1                    |
| `stationGraph.spec.ts`                     | 7                    |
| `stationMetadataUsage.spec.ts`             | 1                    |
| `stmRules.spec.ts`                         | 2                    |
| `versionNavigation.spec.ts`                | 17                   |

### Newly complete scenarios

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

No production changes, test-only application hooks, configuration exclusions or
retry changes were introduced. Catalog wording was clarified against actual
implemented controls: folder membership has no row reorder; report columns have
automatic family ordering and local preferences reset on reload; campaigns have
no duplicate/manual-drag operation; priorities expose trace/category; rules save
immediately with no duplicate/draft operation. Unsupported features are explicitly
unclaimed rather than treated as passing assertions.

## Final execution

**222 passed, zero failed/skipped/retries, using three workers.** Scope:
213 Chromium behavior cases, four Firefox smoke cases, four WebKit smoke cases
and authentication. No automatic retry was used. Complete behavioral coverage
across all three engines and the legacy imported-mission/map suites are outside
this run's scope.

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/expanded-final-verified'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --output=.local/playwright/expanded-final-verified-results --trace=retain-on-failure
```

HTML/JUnit: `.local/playwright/reports/expanded-final-verified/`.
Console: `.local/playwright-expanded-final-verified.log`.
These reports are Git-ignored and may not exist on a fresh checkout.

Focused agent confirmations included: execution/position/dashboard/collaboration
23/23 including auth; endpoint/ownership/metadata/circles 8/8 including auth;
reference/priorities/circles 7/7 including auth; STM 3/3 including auth.
Coordinator campaign/fallback/empty-report confirmation passed 7/7 including auth.
These focused runs supplement the final combined result rather than adding to its
222-case count.

An earlier 222-case combined run also passed in 7.5 minutes. Cross-review then
strengthened reference totals/exports, category/template labels, report search/
status effects and selected-entity deletion assertions. The final run above is
the confirmation of those reviewed files.

The intervening reviewed run finished **220 passed/two failed** in 7.4 minutes:
the two-editor UTC rollback and initial-load readiness timeout described below.
It is retained separately and is not represented as a passing run.

## Assertion review

- Folder lifecycle/movement spans all four entity types, invalid Save and Cancel,
  populated guards, exact memberships and real drag/drop, peers and reload.
- POI descriptions/icons include multiline/empty text and all 22 supported icons,
  list/detail plus real rendered primary/peer/reloaded canvases.
- Station tests cover endpoint rename ordering, deletion protection, child action
  ownership, dwell/crew math, independent 350 m circle geometry and shared-plan
  usage while execution-owned copies stay unchanged. Linked POI totals use one
  known eight-minute, 12 g action.
- EVA metadata validation, managed endpoint switching, unresolved/empty sequence
  slots and cancellation/owned plan-family deletion check exact surviving graphs.
- Action adoption proves lineage and independent payloads, text Cancel/Save and
  numeric duration/mass parent totals. Equipment usage separately checks single-use
  totals and exclusion of reusable equipment at station and EVA consumers.
- Reference/template/priorities/circle lifecycles exercise real consumers, in-use
  deletion guards, invalid edits, peer propagation where required and reload.
- REX start seeding, running-only mode, remote dashboard handover and ten PET input
  boundaries retain planning isolation. Position sources/types, conflict winners,
  history filters and remote draft deletion check persisted scope and recovery.
- Explicit v1/v2 pane matrices cover registered right tabs and fullscreen sections.
  Distinct viewer/editor grants test scoped mission selection, while signed-out/
  expired local cookies test entry recovery and rejected protected HTTP requests.
- Real DEM/worker slope-key checks and temporary measurement lifetime variants
  avoid mocking the terrain response.
- Reports use 22 independently calculated metric rows across four baselines,
  supported column preferences, campaign membership and explicit/latest fallback,
  empty campaigns and selected-POI deletion. STM exact/wildcard/missing-category,
  disabled/duplicate tuple and minimum/threshold cases check separate rule-page
  and active-only EVA coverage semantics.

## Development failures and retained boundaries

- First-wave combined confirmation had **141 passes/one failure out of 142**:
  the station folder's second drag did not activate. The helper now waits for the
  prior overlay, hovers the source and observes activation/droppable state. The
  corrected station drag passed three repeats plus auth before final confirmation.
- Folder name editing has a known 50 ms Redux debounce. Tests advance a controlled
  clock 51 ms before valid Save; immediate-save correctness is not established.
- An agent initially clicked a linked POI association instead of navigating to
  the POI. This was corrected to real POI selection before asserting count/time/
  mass totals. A separate unsupported extra POI refUuid caused peer hydration to
  stall during development; the invalid fixture property was removed.
- `REPORT-003` remains partial: mathematically equal travel totals can render a
  negative-zero delta from floating-point roundoff. The final independent fixture
  uses distinct travel rates, and this unresolved equality boundary is documented
  instead of being credited as complete. See `.local/playwright/reports/report-expanded/`
  and `.local/playwright/report-expanded-results/`.
- `REX-027` remains partial: remote historical deletion correctly removes its
  owned graph, but live planned-detail fallback can leave a stale dropdown/empty
  panel. Fresh-page recovery is established; automatic local recovery is not.
- `POSITION-006` lacks the complete marker-type matrix; `ACTION-010` lacks icon/
  parent/aggregate coverage; `COLLAB-008` lacks the full browser-observed graph
  operation matrix. Their narrower passing tests do not close those rows.
- The reviewed combined run exposed actual UTC data rollback with two editors:
  the author saved 2025-02-20T11:22:33Z, then an editing peer's stale local state
  restored 2024-01-02T01:02:03Z. The source effect in eva-right-eva-info.tsx writes
  local date/time when the remote datetime changes. No production fix was made.
  EVA-006 was demoted to partial; its passing case explicitly uses one editor and
  a read-only peer, retaining authoritative persistence and peer/fresh-client UTC
  checks. The original failure is retained in
  `.local/playwright/reports/expanded-reviewed-confirmation/` and
  `.local/playwright/expanded-reviewed-confirmation-results/`.
  To reproduce after this coverage-only batch, enable editing on the existing
  peer in evaMetadataLifecycle.spec.ts before changing UTC. The read-only-peer
  version passed three focused repetitions plus auth before final confirmation.
- A reviewed run reproduced the earlier readiness symptom: the Bravo-execution
  report-matrix case stayed at Loading mission data beyond the ten-second header
  assertion, before any report calculation. The other three identical fixture
  variants passed. Its trace remains under expanded-reviewed-confirmation-results.
  A read-only trace review found Automerge WebSocket ERR_NO_BUFFER_SPACE, a later
  HTTP 101 reconnect (about five seconds later), then Document unavailable from
  loadDocumentWithProgress. User/version/auth/mission-list/document-list API calls
  returned 200 and the Socket.IO connection succeeded. This suggests a transient
  socket-resource/recovery failure, with underlying cause unconfirmed; no production
  fix, automatic retry or timeout increase was introduced. Baseline-specific report
  logic had not run, so this is separate from metric assertions.

No production mutation checks were performed in this batch; previous mutation
evidence remains in earlier run records.

## Static validation

Passed after final code changes:

```powershell
npm run docs:playwright-scenarios
npm run test:playwright:scenarios
npm run tsc
npx eslint src/tests/playwright/behavior
npx prettier --check src/tests/playwright/behavior docs/testing/RESUME.md docs/testing/runs/2026-10-24-expanded-coverage.md
git diff --check
```

All 81 registered surfaces remain assigned. Generated reports run discovery only;
the 222-case executed result above supplies the browser evidence.

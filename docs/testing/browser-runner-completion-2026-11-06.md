# Browser runner completion - 6 November 2026

Scope: the remaining Playwright suite at `9b02e21f`, on
`codex/vitest-browser-workflows`. Three feature owners implemented nonoverlapping
migrations; planning reviewed map, map reviewed mission, and mission reviewed
planning. Shared fixture, configuration, CI verification and integration were
owned centrally. The pre-existing deletion of
`docs/testing/int-rebase-2026-11-04.md` is outside these commits.

## Verified baseline

Playwright discovery: **211 Chromium, 17 Firefox, 17 WebKit, one authentication
setup** (246 configured checks). A clean worktree at the starting commit ran all
**754 Vitest Browser tests successfully**, with three workers and a fresh,
separate optimizer cache: 157.15 seconds from runner start to the last test.
Node coverage shards ran **665 + 757 + 903 = 2,325 tests**, all passing.

Before editing the benchmarked specifications, the station graph (7), report
columns (2), and measurement terrain (4) workloads passed together with one
worker: **13 application scenarios plus authentication, 102.70 seconds**.
The application services had been restarted; their existing dependency cache was
retained. No coverage instrumentation was enabled. An earlier attempt failed
when the other checkout's app service was stopped; that attempt is excluded
from performance comparisons. Browser `list` collection also failed on mocked
modules; the clean-worktree execution above supplies the verified baseline.

## Final inventory and validation

| Runner                                                   |  Before |   After |
| -------------------------------------------------------- | ------: | ------: |
| Playwright Chromium                                      |     211 |     137 |
| Playwright Firefox / WebKit                              | 17 / 17 | 13 / 13 |
| Authentication setup                                     |       1 |       1 |
| All configured Playwright checks                         |     246 |     164 |
| Vitest Browser Chromium, including high-DPI              |     706 |     809 |
| Vitest Browser Firefox/WebKit parity, including high-DPI |      48 |      60 |
| All Vitest Browser tests                                 |     754 |     869 |
| Ordinary Node Vitest tests                               |   2,325 |   2,325 |

All **211 original Chromium scenarios** and their configured parity equivalents
were reviewed: 68 planning/entity/execution, 38 map/terrain/position, 81 mission/
admin/report/export and 24 root-owned scenarios. The three feature ledgers plus
the root mapping account for the complete baseline. Retained integration files
are indexed below; no percentage-reduction target was used.

- `npm run test:all` passed: lint, types, builds, all 2,325 Node tests and all
  **869 browser tests across 167 file/project pairs**. Full command: **351.81s**;
  browser runner: **237.42s**, with three workers and warmed dependency caches.
- Full unfiltered Playwright passed **164/164**, three workers, **494.96s**
  complete CLI / 8.2 minutes reporter duration. No retries or skips in this run.
- Real browser coverage shards passed **301/271/237**, selecting all **149 pairs**
  exactly once; parity passed **60** across **18 pairs**. Node shards passed
  **665/757/903**, selecting all **170 files** exactly once.
- Six distinct nonempty blobs merge with exactly **20,334 covered source lines**;
  merged JSON, LCOV and class-level Cobertura have identical covered-line sets.
  JUnit's exact identities match every executed blob task: **3,194 unique cases**.
- Every missing or empty blob (12 negative cases) and a removed passing JUnit
  testcase were rejected. Restored artifacts passed again.
- CI selection remains **41/41/41/40 Playwright checks**, **50/50/49 Chromium
  coverage pairs**, and **57/57/56 Node files**. Deployment/manual-launch gates
  remain intact; see the [CI layout](ci-layout.md) for allocation reasoning.

Development failures were investigated and corrected: shared HTTP-handler
leakage; throttled graph hover and map-center samples; an ambiguous EVA selector;
missing walkback fixture data and admin edit-mode setup; late startup dependency
optimization; and the WebKit workflow budget. A cold-cache actual-bootstrap test
passed after explicit dependency prebundling, without optimizer reloads. The
first full Playwright attempt passed 159 and failed five (two missing-token
failures plus three fixture/control setup failures); the corrected full rerun
above passed every check. Protocol tests used a matching temporary local DUST
token in API and test processes; no tracked environment/credential files changed.
The final standard gate also passed after the native timing/setup corrections.

The implementation is committed as `b99bfc74`. Machine-readable counts,
commands, timings and artifact checks are in the
[evidence snapshot](browser-runner-evidence-2026-11-06.json).
**No local blockers remain. GitLab pipeline performance is unmeasured**; merge
readiness still requires the actual candidate pipeline and manual full-suite gate.

## Runner and fixture changes

The shared mission harness supports additional seeded documents in the same
network-free Repo, route setup and transitions, and optional readiness waiting.
These support real menu mission switches, pending-response races, hydration
recovery and admin STM workflows. Tests still mount production components,
Redux, Automerge, canvas and OpenLayers. HTTP fixtures are explicit and unexpected
requests and native dialogs fail. Each test receives a fresh HTTP-handler map,
preventing handlers from retaining a previous fixture document. Remounts establish
local rehydration only. Startup dependencies are explicitly prebundled for stable
cold collection.

Vitest Browser has a separate optimizer cache from the development application,
with `VITEST_BROWSER_CACHE_DIR` and `VITEST_BROWSER_PORT` overrides for concurrent
isolated runs. Each implementation agent used its own port/cache and one worker.
Full-stack runs remained sequential with unique authenticated accounts, missions
and report directories. Native Firefox/WebKit coverage includes smoke,
celestial input, crew-source paths and the slope legend in addition to the
existing action, accessibility, map and high-DPI checks.

## Root-owned scenario mapping (24 original Chromium scenarios)

| Original Playwright contract                                                            | Replacement and integration boundary                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke`: planned entity/map exposure                                                    | `behavior/smoke.browser.test.tsx`: exact two-EVA, station, POI and real canvas assertions, all three engines.                                                                                                                                                                                                                         |
| `smoke`: no execution dashboard                                                         | Same browser file: explicit empty state, absent map and clock, all three engines.                                                                                                                                                                                                                                                     |
| `smoke`: active execution clock/maps                                                    | Same browser file: exact PET, both map viewports and independent position label, all three engines.                                                                                                                                                                                                                                   |
| `smoke`: identity/relationships after fresh load                                        | Retained in all three engines: authenticated served route and real persisted document seed after browser reload.                                                                                                                                                                                                                      |
| `requestRecovery`: 401/403/500 creation failure matrix                                  | `AdminLoading.browser.test.tsx`: real user form retains username/password, shows error, retries exactly twice in total, submits identical identity/grants, clears error. Retained Playwright anchor expires the real session, verifies server rejection/no creation, restores authentication and verifies exactly one persisted user. |
| `accessibilityCoverage`: keyboard edit and downloaded JSON                              | Retained three-engine integration: keyboard Save persists to real server and the actual filesystem download contains the saved value. Native accessibility tests separately cover focus, validation, Cancel and Save.                                                                                                                 |
| `collaborationPresence`: distinct editor/viewer accounts                                | Retained in all three engines: real account permissions, presence counts, live updates, independent selection and HTTP revocation across authenticated contexts.                                                                                                                                                                      |
| `collaborationDurability`: close every client                                           | Retained: all writer contexts close; a new context loads a server-persisted write and excludes the unsaved draft.                                                                                                                                                                                                                     |
| `collaborationDurability`: API restart                                                  | Retained: disposable real API restart preserves database writes, changes the epoch, rejects the old WebSocket and stale changes, and permits fresh-client recovery.                                                                                                                                                                   |
| `transportRecovery`: Automerge-only vs full transport outage                            | Both retained: real WebSocket disconnection/readiness gating, live HTTP/Socket.IO distinction, failed version polling, buffered catch-up and authoritative peer write after recovery.                                                                                                                                                 |
| `missionSyncSwitch`: delayed document/terrain/socket isolation                          | Retained: delayed real CRDT frames, served DEM and socket events cannot cross a mission switch. Local measurement/pending HTTP races moved to browser fixtures.                                                                                                                                                                       |
| `maestroHydration`: authentication, snapshots, UUID maps, delivery and atomic rejection | Retained: real Maestro socket protocol, subscription/leave gating, server authorization/schema checks and atomic persisted graph changes.                                                                                                                                                                                             |
| `maestroExecution`: start policy and duration/PET wire values                           | Retained: actual socket acknowledgements and wire sentinels/null/zero distinctions reach persisted graph and subscribed UI; ordinary UI value matrices run natively.                                                                                                                                                                  |
| `maestroRecovery`: concurrent graph identity and acknowledged recovery                  | Retained: actual Maestro reconnect snapshots, concrete lineage IDs and timestamp delivery contracts across sockets.                                                                                                                                                                                                                   |
| `dustContract`: authentication/join rollback and canonical mission-scoped updates       | Retained: actual DUST/EMSS socket authentication, subscription routing, canonical payload delivery and cleanup.                                                                                                                                                                                                                       |

## Feature assertion ledgers

- [Planning, entities and execution](browser-runner-planning-2026-11-06.md): all 68 original Chromium scenarios in 22 files.
- [Map, terrain and positions](browser-runner-map-2026-11-06.md): all 38 original Chromium scenarios, including cross-browser equivalents.
- [Mission, administration, reports and exports](browser-runner-mission-2026-11-06.md): all 81 original Chromium scenarios in 36 files.

The ledgers name the original loop-expanded scenario, its exact native
replacement assertions, and each retained integration assertion and boundary.
They include unchanged synchronization, permission, sampling and recovery
contracts as well as removed scenarios.

## Comparable local benchmark

All runs use one Chromium worker, no coverage, warm dependency optimizer caches
and sequential execution without competing test processes. Playwright reuses the
running application server; each Vitest invocation starts its own server and
pays module-import/browser setup. Durations are measured around the complete
Node CLI process, including fixture setup, authentication where required and
cleanup. The original workload runs from a clean worktree at `9b02e21f` against
the unchanged application implementation.

| Workload                                                                      |                          Before |                                            After |
| ----------------------------------------------------------------------------- | ------------------------------: | -----------------------------------------------: |
| Station graph 7 + report columns 2 + measurement terrain 4 original workflows | 97.98 s (Playwright, plus auth) |                39.25 s (13 native browser tests) |
| Retained station graph peer/persistence boundaries                            |       Included repeatedly above | 20.31 s (2 thin Playwright scenarios, plus auth) |
| Complete comparable assertion workload                                        |                     **97.98 s** |                                      **59.56 s** |

The combined replacement workload is **39.2% faster locally**. This is not a
GitLab pipeline measurement. Initial cold native warmup passed 13 tests; the
first measured native attempt exposed a throttled hover timing race and is
excluded. The corrected test retries actual pointer movement until the requested
independent distance is displayed, then asserts the signed uphill/downhill
values. The final measurement passed every assertion.

## Remaining Playwright index

Counts are Chromium scenarios; consolidated authentication scenarios retain named
steps for every protected served entry route. Authentication setup creates and
cleans up a real isolated account in every shard. Firefox/WebKit retain the
configured smoke, keyboard-download, raster/asset, presence, celestial-peer,
crew-source and rule-transfer integration categories.

| File under `src/tests/playwright/`                  | Chromium scenarios | Integration requirement                                                                                                                 |
| --------------------------------------------------- | -----------------: | --------------------------------------------------------------------------------------------------------------------------------------- |
| `behavior/accessibilityCoverage.spec.ts`            |                  1 | Keyboard Save reaches persisted mission data and actual downloaded filesystem JSON in all three engines.                                |
| `behavior/actionParentMatrixCoverage.spec.ts`       |                  2 | Native drag order reaches a live peer; Unicode task/description/icon and parent ownership survive a fresh server page.                  |
| `behavior/actionStatusPermissionCoverage.spec.ts`   |                  1 | Persisted account grants deny viewer changes while live status edits reach a peer.                                                      |
| `behavior/actionTemplateRoundTripCoverage.spec.ts`  |                  3 | Real viewer/editor/admin account grants protect template mutations and mission-scoped ownership.                                        |
| `behavior/adminCompleteness.spec.ts`                |                  4 | Filesystem copy/rollback, file validation, persisted layers and actual hierarchical mission administration.                             |
| `behavior/adminDataWorkflows.spec.ts`               |                  6 | Actual user database, mission assets, ZIP and Box provider delivery, and server-backed edits/cleanup.                                   |
| `behavior/adminDiagnostics.spec.ts`                 |                  2 | Authorized/missing mission HTTP contracts, actual dump downloads, real socket/system diagnostics and revocation.                        |
| `behavior/adminMission.spec.ts`                     |                  1 | Creates/deletes database and Automerge mission identities without deleting a separate mission.                                          |
| `behavior/adminPermissions.spec.ts`                 |                  2 | Persisted admin/editor grants, forbidden HTTP fields and live document transport revocation.                                            |
| `behavior/authBoundaries.spec.ts`                   |                  4 | Real viewer/editor/admin session permissions and denied HTTP/WebSocket operations.                                                      |
| `behavior/authEntry.spec.ts`                        |                  4 | Real signed-out/expired cookies for all served entry routes; scoped viewer/editor mission listings and switching.                       |
| `behavior/campaignFallback.spec.ts`                 |                  2 | Live remote designated-REX deletion versus planned-EVA cascade resolves references without stale reports.                               |
| `behavior/campaignLifecycle.spec.ts`                |                  1 | Saved campaign membership/designation reaches an open peer and reconstructs from the server.                                            |
| `behavior/celestialControls.spec.ts`                |                  1 | Saved EVA direction reaches live peer and survives server reload independently of presets.                                              |
| `behavior/collaboration.spec.ts`                    |                  5 | Distinct clients converge committed saves, concurrent unrelated edits, entity creation and reconnect catch-up.                          |
| `behavior/collaborationAtomicGraphCoverage.spec.ts` |                  5 | Real CRDT transport publishes complete graph duplication/deletion and owned references atomically.                                      |
| `behavior/collaborationDeleteDraftCoverage.spec.ts` |                  4 | Remote deletion invalidates open client drafts and selection through actual synchronization.                                            |
| `behavior/collaborationDurability.spec.ts`          |                  2 | Fresh contexts after all writers close; disposable API restart, epoch rejection and durable database recovery.                          |
| `behavior/collaborationPresence.spec.ts`            |                  1 | Real editor/viewer account presence, independent selections, live updates and HTTP revocation across engines.                           |
| `behavior/configuration.spec.ts`                    |                  1 | Saved mission name reaches an open peer header and reconstructs after server reload.                                                    |
| `behavior/crewPositionSources.spec.ts`              |                  1 | Source color edits reach rendered peer paths and persist; selected full-stack parity remains.                                           |
| `behavior/dashboardFollowCoverage.spec.ts`          |                  1 | Remote source/position updates alter open dashboard follow choices without stale recentering.                                           |
| `behavior/dashboardHandoverCoverage.spec.ts`        |                  1 | Remote start, pause/resume, stop and handover update an already open dashboard without reload.                                          |
| `behavior/dustContract.spec.ts`                     |                  2 | Actual DUST/EMSS socket authentication, mission-scoped subscriptions, rollback and canonical update delivery.                           |
| `behavior/entityLocations.spec.ts`                  |                  2 | Point changes sample served GeoTIFF and server grid; cleared geometry persists with parent identity.                                    |
| `behavior/evaItinerary.spec.ts`                     |                  1 | Real DEM profiles resample changed itinerary/traverse geometry and persist the independent graph.                                       |
| `behavior/evaMetadataLifecycle.spec.ts`             |                  1 | Plan and execution titles/timestamps propagate to peer while preserving scoped identities after reload.                                 |
| `behavior/execution.spec.ts`                        |                  2 | Editor start/stop reaches an already open real dashboard with the owning PET and map scope.                                             |
| `behavior/executionClock.spec.ts`                   |                  3 | Authenticated Maestro completion writes; positive/negative real server-clock correction across reconnect.                               |
| `behavior/executionCoverage.spec.ts`                |                  2 | Simultaneous starts converge over delayed CRDT frames; remote stop changes active UI ownership.                                         |
| `behavior/executionPolicy.spec.ts`                  |                  1 | Concurrent mass/identifier drafts merge with peer status changes and persist without losing values.                                     |
| `behavior/exportRecovery.spec.ts`                   |                  1 | Actual permitted viewer/editor downloads retain source mission identity across a delayed mission switch.                                |
| `behavior/exportRoundTrip.spec.ts`                  |                  1 | Filesystem dump restores through supported server Automerge import with exact persisted document identity.                              |
| `behavior/exports.spec.ts`                          |                  2 | Actual combined filesystem JSON includes saved planning values/nested ownership, plus distinct position GeoJSON delivery and filenames. |
| `behavior/folderConcurrency.spec.ts`                |                  3 | Simultaneous move/delete races converge without duplicate/orphan memberships.                                                           |
| `behavior/folders.spec.ts`                          |                  2 | One native folder drop publishes membership to peer; shared visibility reaches rendered peer sources and reload.                        |
| `behavior/geodesyTerrain.spec.ts`                   |                  1 | Actual terrain HTTP400 validation for missing DEM, invalid coordinates and sampling limits.                                             |
| `behavior/gridCoordinates.spec.ts`                  |                  1 | Real served mission grid intersections and saved opacity reconstruct after server load.                                                 |
| `behavior/infrastructure.spec.ts`                   |                  1 | Actual health/version/time/metrics/log/auth service policies; rejected-bootstrap UI moved to native actual entrypoint.                  |
| `behavior/layerStylesAssets.spec.ts`                |                  2 | Served GeoJSON reconstructs persisted style; actual tile HTTP failure/recovery and rendered asset ordering.                             |
| `behavior/legacyStm.spec.ts`                        |                  1 | Admin hierarchy writes reach live/fresh mission and survive server persistence.                                                         |
| `behavior/maestroExecution.spec.ts`                 |                  2 | Real Maestro acknowledgements persist policy, lineage, PET sentinel and null/zero duration wire values.                                 |
| `behavior/maestroHydration.spec.ts`                 |                  6 | Real socket authentication/subscription snapshots/UUID maps and atomic server rejection of malformed MDAU.                              |
| `behavior/maestroRecovery.spec.ts`                  |                  2 | Concurrent graph lineage and acknowledged reconnect snapshots/timestamp delivery over actual sockets.                                   |
| `behavior/measurementLifecycle.spec.ts`             |                  1 | Actual served DEM is sampled by terrain worker and reaches the rendered measurement graph.                                              |
| `behavior/missionAccess.spec.ts`                    |                  1 | Scoped users cannot load/edit denied or deleted missions through actual authenticated routes/endpoints.                                 |
| `behavior/missionCatalog.spec.ts`                   |                  1 | Eventual server summary updates and navigation without full-document list requests.                                                     |
| `behavior/missionDefaults.spec.ts`                  |                  2 | Saved default reaches peer; lander relocation samples real DEM and rebuilds persisted boundary/walkback paths.                          |
| `behavior/missionPriorities.spec.ts`                |                  1 | Shared identifiers reach peer editors and survive server-backed reload.                                                                 |
| `behavior/missionPrioritiesReport.spec.ts`          |                  1 | Live priority/identifier edits recompute already open report from synchronized documents.                                               |
| `behavior/missionRulesTransfer.spec.ts`             |                  1 | Actual rule JSON download delivery and imported rules reach a real peer and persisted graph.                                            |
| `behavior/missionSyncSwitch.spec.ts`                |                  1 | Delayed real CRDT frames, terrain HTTP and socket events cannot leak across missions.                                                   |
| `behavior/navigation.spec.ts`                       |                  2 | Served direct-link/back/forward document lifecycle; full version reload and cache-busting navigation to authenticated mission.          |
| `behavior/poiLinks.spec.ts`                         |                  1 | Shared link/unlink counters reach live peer and persist without adopting source actions.                                                |
| `behavior/poiMetadata.spec.ts`                      |                  1 | Unicode text and icon pixels reach live peer and reconstruct after server load.                                                         |
| `behavior/positions.spec.ts`                        |                  2 | Saved position geometry reaches peer; concurrent/disconnected clients reconcile position history and scope.                             |
| `behavior/presetEditing.spec.ts`                    |                  1 | Saved description, layer style and circle visibility reach live peer and server reload.                                                 |
| `behavior/presetPermissions.spec.ts`                |                  1 | Persisted grants, editor-created ownership and simultaneous editor/admin field synchronization.                                         |
| `behavior/presetTimeCircles.spec.ts`                |                  1 | Actual HTTP PNG slice selection changes rendered pixels at a time boundary.                                                             |
| `behavior/rasterDisplay.spec.ts`                    |                  5 | Real raster/tile HTTP assets, projection/grid/bounds, pixel composition and reload/recovery across engines.                             |
| `behavior/referenceCircles.spec.ts`                 |                  1 | Shared station circle geometry and definition cleanup reach peer and server-persisted references.                                       |
| `behavior/reportCollaboration.spec.ts`              |                  1 | Synchronized action/POI/STM changes recompute open reports without incidental mutations.                                                |
| `behavior/reportMatrix.spec.ts`                     |                  1 | Remote deletion reaches mounted trace report and selects the remaining/empty state.                                                     |
| `behavior/reports.spec.ts`                          |                  1 | Peer edits recompute exact plan/execution comparison values and persist after reload.                                                   |
| `behavior/requestRecovery.spec.ts`                  |                  1 | Expired real session rejects creation; restored session persists exactly one user.                                                      |
| `behavior/restAuthorizationContracts.spec.ts`       |                  1 | Real anonymous/role REST status, payload and persistence authorization contracts.                                                       |
| `behavior/rexMetadata.spec.ts`                      |                  1 | Selected historical REX deletion invalidates peer selection while preserving planned and other execution ownership.                     |
| `behavior/ruleCollaboration.spec.ts`                |                  1 | Real shared STM rule edits/deletion update open peers with consistent references.                                                       |
| `behavior/sameFieldConflictCoverage.spec.ts`        |                  2 | Two disconnected writers concurrently save the same field and converge, then recover subsequent edits.                                  |
| `behavior/smoke.spec.ts`                            |                  1 | Authenticated served mission reload reconstructs actual persisted seeded identity and relationships in three engines.                   |
| `behavior/stationCircles.spec.ts`                   |                  1 | Shared circle styling/visibility reaches live peer geometry and reconstructs after server reload.                                       |
| `behavior/stationGeometry.spec.ts`                  |                  2 | Real DEM sampling after station field/native map movement; persisted connected geometry and owned paths.                                |
| `behavior/stationGraph.spec.ts`                     |                  2 | Alternating two-client endpoint renames and saved dwell reach peer graph labels and server reload.                                      |
| `behavior/stationMetadataUsage.spec.ts`             |                  1 | Saved station description/icon pixels reach live peer and reconstruct from persisted graph.                                             |
| `behavior/terrainDem.spec.ts`                       |                  1 | Actual raster sampling/terrain worker results and persisted terrain-backed changes.                                                     |
| `behavior/transportRecovery.spec.ts`                |                  2 | Real Automerge-only/full transport failures, failed version polling, readiness gating and authoritative catch-up.                       |

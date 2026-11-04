# Integration branch rebase audit — 2026-11-04

Scope: changes introduced between `a7f62109f` (the previous common base) and
`d7dc76801` (`origin/int`). The behavioral branch was rebased to `947ed6926`;
the test updates described here are subsequent working-tree changes. This is a
scoped integration review, not a whole-application completeness assessment.

## Implementation reviewed and coverage

- EVA directions: `eva-sun-earth.tsx`, `useSunEarthAzimuths.ts`, `map-sunearth.tsx`,
  `TimelineAstronaut.tsx` and their consumers. Preset direction controls were
  removed upstream. See [celestialControls](../../src/tests/playwright/behavior/celestialControls.spec.ts),
  [celestialEvaCoverage](../../src/tests/playwright/behavior/celestialEvaCoverage.spec.ts)
  and [evaTimeline](../../src/tests/playwright/behavior/evaTimeline.spec.ts).
  Independent SPICE reference values cover Mercator and polar map north.
- Crew positions: `rex-menu.tsx`, `map-menu-pos.tsx`, `PosEntries.tsx`,
  `MapMenuProvider.tsx`, visibility controls and source editors. See
  [crewPositionSources](../../src/tests/playwright/behavior/crewPositionSources.spec.ts)
  and the existing position lifecycle, rendering, history and type tests.
  The new contract checks exact path membership, source colors, filtering,
  merged/separate preferences, tabs, minimization, peer updates and reload.
- Reports: mission-priority page, table, cell and drilldown components, shared
  report controls and their selectors. See
  [missionPrioritiesReport](../../src/tests/playwright/behavior/missionPrioritiesReport.spec.ts).
  Existing preset draft/peer scenarios now edit preset descriptions, titles and
  styles, preserving their independence from EVA directions.
- Rules: admin import/export component, `stmRulesImportExport.ts` and the Any
  constraint in `stmRuleEngine.ts`. See
  [missionRulesTransfer](../../src/tests/playwright/behavior/missionRulesTransfer.spec.ts):
  exact downloaded backup, invalid-input atomicity, confirmation cancellation,
  file import, peer report updates, reload and Any matching unset definitions.
- Catalog: homepage and admin consumers, catalog routes, summary construction
  and runtime debounce. See [missionCatalog](../../src/tests/playwright/behavior/missionCatalog.spec.ts)
  and the updated authorization/admin tests. Setup waits for summaries before
  opening consumers that load the catalog once. User Management now reads names
  from the summary API instead of opening every mission document; concurrent
  deletion no longer leaves its loading state waiting on an unavailable document.
- Terrain: transient profile store, loading/synchronization, API normalization,
  station/traverse mutators and export integration. Existing
  [stationGeometry](../../src/tests/playwright/behavior/stationGeometry.spec.ts),
  [missionDefaults](../../src/tests/playwright/behavior/missionDefaults.spec.ts)
  and [evaItinerary](../../src/tests/playwright/behavior/evaItinerary.spec.ts)
  now observe real API-derived profiles instead of removed mission fields.
  Report/geodesy arithmetic fixtures provide independent known arrays at the
  batch HTTP boundary; those fixtures do not verify raster sampling.
- Browser regressions exposed by the integration: Escape now works inside the
  nonmodal Dockview positions window while modal dialogs retain their keyboard
  behavior. Timeline axis drawing skips collapsed graphs; previously a reorder
  could spend over 15 seconds drawing invisible ticks and lose its socket heartbeat.
  Both fixes have browser component regressions and existing Playwright scenarios.
- Legacy OpenLayers and mission-preference suites now use the isolated mission
  fixture instead of requiring manually seeded missions 22 and 47. Pixel checks
  inspect the complete rendered canvas so centrally located vector features count as painted content.
- Admin async operations and duplication: progress-stream parsing, final
  success/failure events, copy options, inline errors, loading states and stale
  mission navigation. Existing admin workflows retain the asset-copy rollback
  and source-preservation assertions. The obsolete child-process copy tests
  were removed because copying now uses native filesystem APIs; real filesystem
  contracts remain in `fileSecurity.test.ts`.

## Validation and limits

- Local validation uses an isolated database and static directory. The existing
  development database has migrations from another branch and was preserved.
- `npm run test:all`: lint, TypeScript, build, 2,325 unit tests and 428 browser
  component tests passed. Component fixtures include the user/mission slices
  consumed by the shared report permissions selector.
- Playwright projects explicitly retain the configured 1960 × 1080 viewport
  after applying device presets. Tests with an explicit smaller viewport still
  exercise their specified dimensions.
- Full Playwright run: 564 cases across Chromium and declared Firefox/WebKit
  parity workflows, with retries disabled. It completed with 560 passing and four
  compatibility failures. The fixes wait for debounced catalog names in admin
  permission setup and REST assertions, wait for a manual celestial mode to reach
  the server before reload, and scope save-error assertions to the open modal.
  The exact four failed cases were rerun together using `--last-failed`: all four
  plus the authentication dependency passed (5 passed, no retries). All Firefox
  and WebKit parity cases passed in the full run. The complete suite was not
  repeated after these four test corrections.
- Final standard gate: `.local/rebase-test-all-final5.log`; full browser run:
  `.local/rebase-final.log`; exact failed-case rerun: `.local/rebase-lastfailed.log`.
  Failure traces remain in `.local/pw-final-results`; the final rerun report is
  `.local/pw-lastfailed-report/index.html`.
- The temporary test servers were stopped and the original `.env` restored.
  The isolated database and static directory remain available for diagnosis;
  `.local/env-playwright-int-20261104` records the local test configuration.

No browser contract was added for migration history replacement, cold-server
memory/eviction timing, deployment images, GIS processing or production-scale
copy performance. The corresponding upstream unit tests run in the standard
gate; operational acceptance needs separate evidence. This review does not
establish every report campaign/lineage permutation, every astronomical date,
or exhaustive source-path mode combinations. Existing suites and upstream unit
tests provide additional evidence, not a completeness claim.

No GitLab pipeline was launched. The latest candidate must still pass all eight
CI shards and the other required jobs before its MR can be marked Ready.

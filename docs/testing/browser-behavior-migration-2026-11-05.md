# Browser workflow migration, November 5, 2026

Baseline commit: `d3645bea179d1db57c616f97ed5e056f068f5a19`.

95 Chromium scenarios move from server-backed Playwright fixtures to Vitest
Browser Mode. Playwright discovery drops from 481 to 386 Chromium scenarios;
Firefox and WebKit retain all 41 scenarios each. Including authentication setup,
the configured Playwright suite drops from 564 to 469 tests. The 95 replacements
run in the standard browser suite on every `test:all` invocation.

## Scope

The [mission harness](../../src/tests/vitest-browser/behavior/README.md) mounts the
real mission page, singleton store, real Automerge repo, hydration/audits and map.
HTTP and socket transport are the test boundary. Each test gets its own repo and
mission; remounts reset UI state without discarding the document. Schema validation
uses current source types. Unexpected requests and native dialogs fail tests.

| Original Playwright specification                                               | Replacement in `src/tests/vitest-browser/behavior/` | Retained Playwright boundary                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `planning`                                                                      | `planning.browser.test.tsx`                         | Server-backed rename/reload and downloaded JSON                      |
| `actions`                                                                       | `actions.browser.test.tsx`                          | All original Firefox/WebKit workflows                                |
| `execution`                                                                     | `execution.browser.test.tsx`                        | Start/stop synchronization with a second dashboard                   |
| `executionCoverage`                                                             | `executionCoverage.browser.test.tsx`                | Concurrent starts and remote-stop view updates                       |
| `referenceData`                                                                 | `referenceData.browser.test.tsx`                    | Geography editing and actual export                                  |
| `poiLifecycle`, `presetLifecycle`                                               | Matching `.browser.test.tsx` files                  | Peer workflows remain in separate POI/preset specs                   |
| `referenceValidation`, `definitionUsageCoverage`, `actionVersionFieldsCoverage` | Matching `.browser.test.tsx` files                  | REST/permission and multi-client coverage remain                     |
| `editModeMatrix`, `limitedPolicy`                                               | Matching `.browser.test.tsx` files                  | Server authorization and execution recovery remain                   |
| `reportAggregation`, `reportTraceability`, `stmReports`, `stmRules`             | Matching `.browser.test.tsx` files                  | Report/rule collaboration and download round trips remain            |
| `versionNavigation`, `missionLander`                                            | Matching `.browser.test.tsx` files                  | Navigation/recovery and real DEM/multi-client tests remain           |
| `celestialEvaCoverage`, `mapVisibilityLabels`, `positionHistoryFilterCoverage`  | Matching `.browser.test.tsx` files                  | Celestial parity, map interactions and position collaboration remain |

Mutations still go through the real controls, thunks and Automerge operations.
Document identities, ownership, deletion cascades, independent calculations,
validation messages, Save/Cancel, real rendered features and label pixels remain
asserted. Browser DOM assertions use native Vitest locators. Former reloads in
the moved tests become explicit remounts; the original server boundary remains
covered by the retained Playwright layer.

Implementation areas inspected for this scoped migration include `pages/mission`,
`store/processing/populateStore`, `store/index`, the connection/user slices,
`client/automergeDocHandles`, terrain subscriptions, the mission/HTTP fixtures,
and the migrated test actions and assertions. This is a test-layer migration,
not a whole-application functionality audit. Authentication, permissions, sockets,
recovery, raster sampling and simultaneous UI clients were deliberately retained.

## Runtime evidence

All 95 migrated scenarios were timed against this checkout, with three workers
in each runner. Both runs passed without retries or skips; Playwright also ran
its authentication setup. Process elapsed time includes startup, schema/app
preparation and teardown.

| Measurement                      | Playwright | Vitest Browser Mode |                    Improvement |
| -------------------------------- | ---------: | ------------------: | -----------------------------: |
| Process elapsed time             |   158.38 s |             48.07 s | 3.29� faster (69.6% less time) |
| Sum of the 95 scenario durations |   427.91 s |             89.56 s |                   4.78� faster |

The baseline used the 21 original specifications and their three UI helpers
from the baseline commit, materialized under the ignored
`.local/browser-migration-baseline/` directory. Only the 95 moved scenarios were
selected, and relative imports were redirected to the existing fixtures.
Their actions and assertions were unchanged. A temporary configuration reused
the normal authentication, API, browser settings and application startup while
pointing test discovery at those baseline files. Application source was identical
for both runs; this change modifies test code and documentation.

Commands used:

```sh
node node_modules/@playwright/test/cli.js test --config .local/browser-migration-baseline.config.mts --project=chromium --workers=3 --reporter=json
node node_modules/vitest/vitest.mjs run --config src/tests/vitest-browser/vitest.config.mts src/tests/vitest-browser/behavior --maxWorkers=3 --reporter=json --outputFile=.local/browser-migration-vitest-full-benchmark.json
```

Raw reports, process timings and the prepared baseline remain under
`.local/browser-migration-*` for local inspection. Earlier sample runs discovered
an unrelated AEGIS checkout occupying ports 4000/4001; those timings and failed
checks are excluded. The other instance was closed, and the final run verified
that Vite served this checkout's source. Timings are local observations and do
not predict the full eight-shard CI duration. The shard count is unchanged.

## Validation

- `npm run test:all` passed lint, TypeScript, build, 2,325 unit tests and 523
  browser tests. The complete browser suite, including the 95 replacements,
  took 34.26 s with its default concurrency.
- The original 95 Playwright scenarios plus authentication passed against this
  checkout, without retries, skips or flaky results.
- All 95 replacements passed in the timed browser run, without retries or skips.
- All 18 retained affected Playwright checks passed: seven Chromium scenarios,
  ten Firefox/WebKit action scenarios and authentication. No retries, skips or
  flaky results were reported.

The full manual eight-shard CI suite is still required before merge readiness;
no CI execution is claimed here.

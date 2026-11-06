# Browser workflow migration: second pass, November 6, 2026

This records the migration and validation at that point. For current job counts,
parallel scheduling and report handling, see the [CI layout](ci-layout.md).

This expands `fe2415eb` using separate agents for map interactions, client
workflows and dashboard/execution tests, followed by integration and assertion
review. Production application code is unchanged.

## Resulting split

| Configured Playwright checks | Original baseline | First pass | Second pass |
| ---------------------------- | ----------------: | ---------: | ----------: |
| Chromium                     |               481 |        386 |         211 |
| Firefox                      |                41 |         41 |          17 |
| WebKit                       |                41 |         41 |          17 |
| Authentication setup         |                 1 |          1 |           1 |
| Total                        |               564 |        469 |         246 |

The cumulative reduction is 270 Chromium scenarios (56.1%) and 318 configured
Playwright checks overall (56.4%). The second pass adds 183 Chromium workflow
scenarios and moves 24 parity checks per Firefox/WebKit browser to Vitest.
Eight native cases deliberately overlap retained thin integration checks:
six POI metadata cases and two actual download cases. The browser suite now has
754 checks, including 278 workflow scenarios in Chromium and the 48 additional
Firefox/WebKit parity checks.

Each Firefox/WebKit browser still covers the original 41 scenarios across the
two runners: 24 client parity checks in Vitest and 17 full-stack checks in
Playwright. Responsive checks retain real device pixel ratio 2. The remaining
Playwright suite exercises authentication, permissions, persistence, genuine
concurrent UI clients, sockets/Maestro/DUST, recovery, actual downloads and
HTTP/raster serving.

## Migration scope

- Map agent: 93 scenarios covering directives, selection/hover, geometry editing,
  QuickMap handoffs, map controls, rendering and integrated workflows. Four real
  startup/hash/hard-reload/home-navigation checks remain in `mapOlWorkflows`.
- Client agent: 37 native scenarios, removing 31 Playwright cases. This includes
  action-parent/template matrices, field validation, folder CRUD, report metrics,
  POI mass, and fresh-reader cases. Genuine peer/account cases remain. All 22 POI
  icons are asserted natively, with representative peer checks per shape retained.
- Dashboard agent: 34 scenarios for dashboard/minimap behavior, execution policy,
  position rendering/types, calculations, timelines and generated export data.
  Peer/disconnect/Maestro and time-slice HTTP cases remain.
- Integration: eight accessibility workflows, including three high-DPI layouts,
  and all eleven export-content cases. Actual keyboard download and JSON/GeoJSON
  delivery checks remain in Playwright. Action, map-editing and celestial-control
  parity also run in Firefox/WebKit through Vitest.

The shared fixture mounts the real dashboard as well as the editor, accepts
explicit independent HTTP responses, and captures the Blob/filename emitted by
real export controls. Download-capture errors are checked outside the app's
error handler, and generated anchors/URLs are removed after each capture.
Real pointer commands translate iframe coordinates and CSS scaling into browser
coordinates. They drive native mouse/keyboard events and the real OpenLayers map.

Former fresh-page checks become explicit remounts. Genuine simultaneous UI
assertions remain in Playwright. The review checked the original assertions and
identified the five passive-reader cases that did not require two live UIs.
This record covers the test migration and execution evidence; it is not a
whole-application functionality audit.

## Validation and timing

Targeted agent batches passed: map 93/93, client 37/37, dashboard 34/34.
The final `npm run test:all` passed lint, TypeScript, build, all 2,325 unit tests
and all 754 browser tests (115 browser test-file instances). The browser suite
reported 95.84 seconds with its default concurrency. No tests were skipped.

A matched 93-scenario map benchmark used three workers in each runner, with
process startup and teardown included. Both runs passed; Playwright also ran
its authentication setup. The baseline tests came unchanged from `fe2415eb`,
with their four retained real-navigation cases excluded. Relative imports were
redirected to the existing fixtures. Both runs used the same application source.

| Measurement                      | Playwright | Vitest Browser Mode |  Improvement |
| -------------------------------- | ---------: | ------------------: | -----------: |
| Process elapsed                  |   122.23 s |             39.97 s | 3.06� faster |
| Sum of the 93 scenario durations |   345.62 s |             70.59 s | 4.90� faster |

The original development ports again belonged to another checkout, so the final
Playwright checks used an isolated frontend/API on 14400/14401. The Vite module
served there was checked against this branch. The API used the current build;
fixture imports, authentication navigation and fixture asset origins were
adjusted for the isolated local server. None of these temporary runner changes
altered application source or assertions.

Raw reports, runner configurations, prepared baseline tests and process timings
remain under ignored `.local/second-wave-*` paths for local inspection. Commands:

```sh
node node_modules/@playwright/test/cli.js test --config .local/second-wave-map-baseline.config.mts --project=chromium --workers=3 --reporter=json
node node_modules/vitest/vitest.mjs run --config src/tests/vitest-browser/vitest.config.mts --project=chromium --maxWorkers=3 src/tests/vitest-browser/behavior/mapDirectives.browser.test.tsx src/tests/vitest-browser/behavior/mapSelection.browser.test.tsx src/tests/vitest-browser/behavior/mapEditing.browser.test.tsx src/tests/vitest-browser/behavior/mapLifecycleHandoff.browser.test.tsx src/tests/vitest-browser/behavior/mapOlInteractions.browser.test.tsx src/tests/vitest-browser/behavior/mapOlWorkflows.browser.test.tsx
```

All 46 retained affected Playwright checks passed in a clean run: authentication,
41 Chromium cases, two Firefox cases and two WebKit cases. This includes real
concurrent UI clients, permissions, persistence, Maestro and downloads. The run
reported 170.21 seconds, with zero skips, retries or flaky results.

An earlier retained run was invalidated by a package-script edit while Vite was
serving the test app. `package.json` is a Vite configuration dependency; the edit
at 00:03:14 restarted Vite during the WebKit peer test, removing its open dialog.
The isolated recheck passed, followed by the full clean 46-check run with no
runtime-file edits. No assertion or application behavior changed for that issue.

CI runs Firefox/WebKit parity without coverage, then collects V8 coverage from
the standard and high-DPI Chromium projects. V8's CDP collection is unavailable
in the other browser engines. An eight-case local coverage smoke run passed in
both Chromium projects and produced a coverage summary; the existing uncovered
server-file parser warnings remain outside this test migration.

The first aggregate browser run passed 753 of 754 cases. The long rate-inheritance
workflow reached the default 15-second budget at its last export click. It has a
scoped 30-second limit; the 47-click zoom-clamp workflow has a scoped 40-second
limit. Their real interactions and all assertions remain intact. No blanket
timeout increase or skip was introduced.

The full eight-shard CI suite remains required before merge readiness. No CI
execution or whole-application runtime improvement is inferred from a filtered
local run.

# Playwright scenario coverage above ninety percent

Coverage checkpoint on `codex/playwright-behavioral-baseline`, following
`1415ddd73`, recorded on 2026-10-25. Reviewed mapping coverage increased from
61.7% to **90.1%**. The [catalog](../scenario-catalog.json) preserves the complete
acceptance contracts and the [generated report](../coverage.md) lists their evidence.

## Coverage accounting

| Measure                                         | Before          | After               |
| ----------------------------------------------- | --------------- | ------------------- |
| Complete eligible scenarios                     | 156/253 (61.7%) | **228/253 (90.1%)** |
| Complete P0 scenarios                           | 87/146 (59.6%)  | **128/146 (87.7%)** |
| Chromium behavior cases                         | 256             | **370**             |
| Combined behavior, browser smoke and auth cases | 265             | **379**             |

Eight Luna subagents implemented small assignments across authentication and
navigation, measurements, presets and maps, reports, administration, integrations,
execution, and entities. The coordinator reviewed evidence, maintained coverage
accounting and ran acceptance checks without building specific tests. The runtime
allowed three active subagents at a time, so the same eight agents worked in waves.

The expansion adds **114 Chromium behavior cases in 48 new spec files** and
completes 72 more scenario mappings. The inventory remains 260 rows, including
seven external scenarios; the eligible denominator remains 253. Scenario titles,
priorities, actions, expected outcomes and fixture contracts are unchanged.
There are five partial mappings and 20 gaps. This percentage measures reviewed
scenario-to-test mappings, not JavaScript line coverage or executed pass rate.

## Validation commands and scope

The final combined browser run passed **379/379 cases in 13.0 minutes, with zero
retries and zero skips**: 370 Chromium behavior cases, four Firefox smoke cases,
four WebKit smoke cases and one authentication setup. The saved JUnit report has
zero failures and errors, and Playwright records the run as passed.

`npm run test:all` passed full JavaScript/CSS lint, TypeScript, the production
build, **145 unit-test files / 2,103 tests**, and **42 browser-component files /
399 tests** after the final source corrections. Formatting, catalog invariants
and report freshness passed. The 90% gate passed; a 90.2% requirement and an
invalid negative threshold both correctly returned failure.

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/coverage90/final-verified-report'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --workers=3 --retries=0 --trace=retain-on-failure --output=.local/coverage90/final-verified-results

npm run test:all
npm run docs:playwright-scenarios
npm run test:playwright:scenarios:90
git diff --check
```

The combined browser scope includes every Chromium behavior case, four smoke
cases each in Firefox and WebKit, and authentication setup. Every mapped test
reference belongs to this scope. Legacy suites that mutate imported missions
are outside it; this is not full unfiltered Playwright or CI acceptance.

The new `test:playwright:scenarios:90` command checks report freshness, discovery
and an exact 90% minimum using unrounded counts. It executes no browser tests.
All 81 registered surfaces remain assigned. Browser discovery contains no skipped
cases in the acceptance scope. No retries, skip/fixme gates, blanket timeout
increases or Playwright configuration changes were introduced.

## Behavior and repaired defects

- Authentication and navigation cases exercise role boundaries, missing missions,
  session transitions, hydration failure and retry, tab-version fallback, and
  concurrent folder membership. Hydration now ignores stale attempts; folder
  repair rechecks current edit rights and document ownership before writing.
- Measurement cases use real terrain fixtures and independent geometry values,
  exercise unavailable and stale data, cancel and restore drafts, and recover
  from request failures. Profile rendering now handles finite axis ranges,
  no-data gaps and physical distances without locking the browser.
- Map and preset cases cover coordinates, grid modes, raster content, styles,
  marker labels, visibility, selection, celestial dates and projections. Escape
  and navigation cancel pending position entry; multiline labels use rendered
  canvas bounds. Valid live projection changes rebuild the map; unrelated view
  settings do not trigger a rebuild.
- Entity and execution cases cover clear-location geometry, walkback updates,
  itinerary and timeline edits, limited-policy matrices, dashboard state and
  position rendering. Station clearing handles an absent lander. Client clock
  correction handles positive and negative server offsets.
- Reports and integrations cover aggregation, traceability, campaign permissions,
  collaborative rules, legacy STM, exports, DUST, Maestro and mission switching.
  Legacy planned STM totals exclude execution copies and disabled work. Export
  failure offers recovery, missing dumps return 404, and Maestro validates graph
  references before staging changes.
- Administration cases use real disposable accounts and persisted grants.
  HTTP requests now refresh role and mission grants from the database; admin-only
  projection and action-system configuration is checked on the HTTP fields route.
  User creation waits for mission-listing readiness, with a controlled delayed
  response reproducing the previous empty-grant initialization race. Permission
  checkbox updates preserve immutable state. Unrelated mission-name hydration
  does not block creation once the listing is available.

## Remaining partial mappings

This section records the original 90% checkpoint assessment. The subsequent
[scope sweep](../RESUME.md#scope-sweep-and-current-mapping) corrected the
unsupported socket-revocation, shared preset draft, and real worker-outage
requirements. Use the current catalog for scope/status; the executed results
below remain historical evidence and were not rerun by that sweep.

**ADMIN-005 remains partial because an already-open Automerge WebSocket can still
write after its user's grant is revoked.** HTTP reads and writes reject that
user, and fresh revoked login access is denied. The characterization attaches
the attempted existing-socket write and before/after state; it does not establish
server-side WebSocket revocation. Raw transport authorization scenarios
`AUTH-002` through `AUTH-005` remain gaps.

`MEASURE-005` covers real API validation failures and an intercepted worker 503,
including visible recovery; it does not induce an actual worker-pool outage.
`PRESET-002` covers sun draft Save/Cancel, while layer and circle controls write
immediately and have no shared draft transaction. `COLLAB-008` still lacks the
complete atomic graph matrix, and `ACCESS-003` lacks full cross-browser visual
parity. Read each catalog note before promoting these rows.

## Local execution and retained evidence

Use a stable built API and Vite server during parallel browser work. API watch
restarts invalidate fixture epochs. After a rebuild, check sustained API and
proxy readiness and a fresh login page; an initial health response alone did
not establish readiness in this environment.

Only the API and Vite processes started for this task were stopped after
validation, using their recorded process IDs and verified command lines.

A missing `DUST_TOKEN` was generated in the ignored local `.env`; no existing
credential was changed. Entity, station and EVA fixtures generate small owned
DEMs instead of copying a multi-gigabyte mission asset. Wait for authoritative
persistence after UI writes before reload or subsequent fixture changes.

Evidence is retained under `.local/coverage90/`. The first combined checkpoint
passed 311 of 312 cases and exposed an ambiguous policy locator, subsequently
scoped to its execution sequence and verified twice. The first complete run
passed 377 of 379 cases and exposed an admin permission-control failure and invalid
projection handling. The corrected 11-case admin and celestial bundle passed at
three workers, as did all five MapProvider component cases and four map-selection
cases. Invalid projection candidates are parsed without global registry mutation
and checked at the configured lander; rejection retains the last accepted map.
Earlier type diagnostics, component mock corrections and
label-bound checks remain in the logs rather than being hidden by retries.

A second complete run also passed 377 of 379 cases. It exposed a None-mode test
fixture's invalid assumption about limited-mode bookkeeping and a user-creation
gate that waited for every global mission document to hydrate. The fixture now
checks original and added action denial without writing limited-mode state; its
full spec passed twice at three workers. The creation gate now depends only on
the listing required to initialize grants. Admin permissions and the unchanged
HTTP recovery case passed together at three workers with zero retries.

Primary artifacts are `final-verified.log`, `final-verified-report/`,
`final-verified-results/`, `test-all-final.log` and `gate90-final.log`. The earlier
failed complete runs are retained as `final-combined.log` and
`final-acceptance.log`, with matching reports and results. These ignored artifacts
may be absent on a fresh checkout. The prior
[sixty-percent record](2026-10-25-sixty-percent-coverage.md) preserves the earlier
checkpoint. No commit, push, pipeline or merge-request state change was made.

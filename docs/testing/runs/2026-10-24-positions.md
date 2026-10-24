# Playwright position coverage validation — 2026-10-24

Source: the commit containing this record, following checkpoint `29363b92`.
Environment: Windows, local Vite/API/PostgreSQL/Automerge, Playwright 1.63.0,
three workers, no retries. Each behavioral case creates and deletes its own
mission. Application sources are unchanged after the mutation checks.

## Coverage added

Five new Chromium cases in `behavior/positions.spec.ts` close three existing
scenario gaps:

- `POSITION-001`: New Pos captures PET at 300 seconds before a 90-second delay;
  both ticking and paused variants retain that captured PET. Type/source changes
  made during placement save with the new point. The test checks creation/update
  timestamps, exact history, coordinates, map markers and reload. A separate case
  proves that New Pos requires a type and cancellation removes the pending map
  interaction without creating an entry.
- `POSITION-002`: moving an existing entry saves coordinates and updatedAt while
  retaining its PET, creation time and previously saved metadata. Full Save
  commits drafted types/source without moving the point. Cancel Edit and Cancel
  Pos preserve the last committed entry. A second page observes saved values
  and markers; both pages reload and retain the result.
- `POSITION-003`: Edit and Delete Entry are the supported list actions; there is
  no duplicate control. Deletion cancellation preserves the mission. Confirmed
  deletion removes only the intended entry, marker, label and obsolete path,
  preserving other source/type entries, definitions and the other execution.
  Exact history and remaining markers are checked after reload.

Complete scenario mappings rise from **85/253 (33.6%) to 88/253 (34.8%)**. P0
mappings rise from **50/146 (34.2%) to 52/146 (35.6%)**. The denominator is
unchanged; 156 gaps and nine partial mappings remain. These are scenario mapping
percentages, not JavaScript line coverage or an executed pass rate.

## Browser execution

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/positions-confirmed'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --trace=retain-on-failure
```

Result: **111 passed in 4.1 minutes, with zero failures, skips or retries**:
102 Chromium behavior cases, four Firefox smoke cases, four WebKit smoke cases
and authentication. All five new position cases passed in this run.

The configured Firefox/WebKit scope is the smoke suite. The full legacy
imported-mission/map suites are outside this run. Local HTML/JUnit output is
under `.local/playwright/reports/positions-confirmed/`; the execution log is
`.local/playwright-positions-confirmed.log`. These artifacts are ignored by Git.

Focused development runs exposed setup mistakes: the default Task/Crew source
filter hides Rover entries, the position menu covers the visibility launcher,
selection can animate the map, and a canceled-placement click hit the scale bar.
The final helpers use real pointer drags to uncover the visibility controls,
select all sources, restore the menu and wait for the view to settle. Placement
checks that its click lands on the map canvas. Map coordinate assertions allow
submillimeter browser pointer precision; persisted latitude/longitude assertions
remain within 0.00000005 degrees. No application changes, timeout increases or
retries were introduced to accommodate these setup errors.

## Defect detection

Two temporary mutations to `thunkDocUpdatePosEntryWithLocation` were exercised
together against the ticking-PET and existing-entry contracts:

1. Add the elapsed placement delay to the captured PET. The new entry test fails
   with **390 seconds received, 300 expected**.
2. Save the drafted source while moving an existing entry. The edit-boundary test
   fails because **Rover replaces the previously saved Crew source** before Save.

Authentication passed; both targeted browser cases failed at the intended
persisted-data assertions. The mutation script restored the source byte-for-byte
in `finally` and verified restoration. Expected mutant failures are separate
from the restored application results.

Local evidence: `.local/playwright/reports/positions-mutations/`,
`.local/playwright/position-mutations-results/` and
`.local/playwright-positions-mutations.log`. The local reproduction script is
`.local/playwright-position-mutations.mjs`.

## Static validation

TypeScript, scoped ESLint, Prettier, generated scenario report freshness and
`git diff --check` pass. Discovery resolves all five new tests and every mapped
test reference. The completeness gate remains unmet because the tracked gaps
and partial rows remain.

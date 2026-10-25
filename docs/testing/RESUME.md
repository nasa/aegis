# Resume Playwright coverage work

Last updated: **2026-10-25**. The [catalog](scenario-catalog.json) and generated
[coverage report](coverage.md) contain the complete acceptance contracts.

## Current checkpoint

Branch: `codex/playwright-behavioral-baseline`, following `63d212733`.
Three subagents expanded action/reference/policy, calculation/
resource, and map/preset coverage; the coordinator reviewed mappings, added
transport coverage, repaired prior regressions and ran combined validation.

| Measure                                   | Before          | Current             |
| ----------------------------------------- | --------------- | ------------------- |
| Complete eligible scenarios               | 129/253 (51.0%) | **156/253 (61.7%)** |
| Complete P0 scenarios                     | 71/146 (48.6%)  | **87/146 (59.6%)**  |
| Chromium behavior cases                   | 213             | **256**             |
| Combined behavior, browser smoke and auth | 222             | **265**             |

Added **43 Chromium behavior cases** in 12 new specs and three extended specs.
There are **92 gaps, five partial mappings and seven external scenarios**.
The 260-row inventory and 253-scenario denominator are unchanged. This percentage
measures reviewed scenario mappings, not JavaScript line coverage or pass rate.

Combined validation: **265/265 passed, zero retries and zero skips**. `npm run test:all` passed:
full JS/CSS lint, TypeScript, production build, **2,103 unit tests** and **399
browser component tests**. Discovery/report freshness and diff checks passed.
See the [validation record](runs/2026-10-25-sixty-percent-coverage.md) for exact
commands, scope, development failures and retained evidence.

## Newly completed mappings

| Area                                                           | Scenarios                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Transport gates/recovery                                       | `AUTH-007`, `COLLAB-012`                                                           |
| Reference usage and templates                                  | `REF-002`, `REF-004`                                                               |
| POI resource/science totals                                    | `POI-008`                                                                          |
| EVA metadata/resources                                         | `EVA-006`, `EVA-012`                                                               |
| Action parent/order/content/version/resource/template matrices | `ACTION-006`, `ACTION-007`, `ACTION-009`, `ACTION-010`, `ACTION-012`, `ACTION-014` |
| Map lifecycle and QuickMap                                     | `MAP-017`, `MAP-019`                                                               |
| Calculated celestial directions                                | `PRESET-011`                                                                       |
| Calculation boundaries                                         | `CALC-002`, `CALC-004`, `CALC-005`, `CALC-006`, `CALC-007`, `CALC-009`             |
| Execution deletion                                             | `REX-027`                                                                          |
| Execution status permissions                                   | `POLICY-007`                                                                       |
| Dashboard follow                                               | `DASH-006`, `DASH-007`                                                             |
| Comparison metrics/equality                                    | `REPORT-003`                                                                       |

`PRESET-012` gained passing evidence for date attribution and missing prerequisites
but remains partial because invalid-date inputs are not covered. The manual-angle
case does not complete the broader circle/direction matrix in `PRESET-008`.
Geographic reporting in `ACTION-012` means downloaded JSON names; there is no
separate parent/EVA geographic aggregate interface. Template and status role
checks use real accounts; they do not complete raw-transport authorization rows.

## Production defects repaired

- EVA UTC synchronization no longer writes stale local date/time after a peer edit.
  Only explicit field submission writes the timestamp; two editing clients and
  initially empty date/time inputs are covered.
- Deleting a historical execution restores planned selection and information on
  both the author and a live peer, including an execution-only tab.
- Comparison equality tolerates floating-point summation noise consistently in
  cells, tint, tooltip and differences-only filtering.
- Traverse action dwell no longer advances calculated clocks twice.
- Zero/nonfinite subdivision spacing no longer freezes timeline construction.
- Missing executed mass remains unknown rather than becoming a recorded zero in
  comparison totals and sequence details.
- Position-type changes preserve dashboard station/traverse follow choices, and
  empty type lists rebuild the options.

## Remaining boundaries and next batch

The five partial rows are `POLICY-002`, `POSITION-006`, `PRESET-012`, `COLLAB-008`
and `ACCESS-003`. Read their full catalog notes before extending them.

Useful next work includes viewer/editor authorization across HTTP and Automerge
(`AUTH-002/003`), the original-entity limited-policy matrix (`POLICY-002`), full
position marker-type combinations (`POSITION-006`), real DEM profile/stale-response
cases (`MEASURE-003/004`), peer-observed atomic graph operations (`COLLAB-008`),
and a disposable server restart/epoch drill (`COLLAB-011/013`). Same-epoch fault
injection in this batch does not establish actual restart recovery.

Do not change a denominator or promote a broad row from a subset of its outcomes.
Current P0 mapping coverage is 59.6%; the completed 60% target applies to overall
scenario coverage.

## Commands and environment

Use current dependencies/browser binaries, normal local environment and local
PostgreSQL schema/migrations. Tests create and delete isolated missions. Avoid API
watch restarts during parallel browser work: shared source edits can rebuild the
API and invalidate every fixture's server epoch. Use one stable built API and Vite
server for concurrent focused runs, with unique report/output directories.

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/coverage-60-combined-final'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --workers=3 --output=.local/playwright/coverage-60-combined-final-results --trace=retain-on-failure

npm run docs:playwright-scenarios
npm run test:playwright:scenarios
npm run test:all

git diff --check
```

The combined run covers all behavioral cases in Chromium and four smoke cases each
in Firefox/WebKit plus authentication. Legacy imported-mission/map suites are
outside this acceptance scope. Before finishing an MR, follow the full local and
CI regression requirements in [CLAUDE.md](../../CLAUDE.md#before-finishing-a-merge-request).
No push, pipeline or MR-state change was made in this batch.

## Fixture lessons and retained evidence

- Use `mission.change()` only to arrange state. Keep fixture shapes schema-valid;
  an action template must omit action-only fields such as `enabled`.
- Wait for authoritative persistence after UI writes before reload or another
  fixture arrangement. Rendering a local value is not a server acknowledgment.
- A dialog shell can have zero bounds while its positioned input is visible;
  assert the actual input/control rather than visibility of `dialog[open]` itself.
- Wait for zoom animations before the next limit step. The minimum zoom can be
  constrained by viewport height rather than the configured numeric minimum.
- Action menus near viewport edges should collapse the expanded action and center
  the real trigger before opening. Parent helpers remain idempotent.
- Disabled follow options are local UI state; peer position-type edits must retain
  unrelated choices. QuickMap tests capture `window.open` without contacting the
  external service and assert encoded geometry/coordinates/colors/time.
- Independent celestial expectations use the checked-in SPICE corpus plus analytic
  projection convergence, rather than the application's astronomy implementation.
- Earlier socket/readiness history and mutation evidence remain in the
  [2026-10-24 record](runs/2026-10-24-expanded-coverage.md).

Current evidence is under `.local/playwright/reports/coverage-60-combined-final/`
and `.local/playwright-60-test-all-final.log`. The validation record lists focused
before/after and first-combined evidence. Local ignored artifacts may be absent
on a fresh checkout; committed documentation preserves the findings.

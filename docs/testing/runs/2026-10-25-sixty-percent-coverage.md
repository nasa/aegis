# Playwright coverage above sixty percent — 2026-10-25

Validation checkpoint: working tree following `63d212733` on
`codex/playwright-behavioral-baseline`, recorded before the coverage commit.

## Coverage accounting

| Measure                            | Before          | After               |
| ---------------------------------- | --------------- | ------------------- |
| Complete eligible scenarios        | 129/253 (51.0%) | **156/253 (61.7%)** |
| Complete P0 scenarios              | 71/146 (48.6%)  | **87/146 (59.6%)**  |
| Chromium behavior cases            | 213             | **256**             |
| Combined behavior/smoke/auth cases | 222             | **265**             |

Added 43 Chromium cases across 12 new specs and extensions to
`evaMetadataLifecycle`, `rexMetadata` and `reportMatrix`. Three subagents developed
independent capability batches. The coordinator reviewed test bodies and mappings,
added transport coverage and ran combined acceptance.

The inventory remains 260 rows, including seven external scenarios. No scenario
was deleted, split, merged or downgraded to reduce the 253-scenario denominator.
There are now 92 gaps and five partial mappings. The percentage is a reviewed
scenario mapping measure; report generation executes no browser tests.

Completed IDs are listed in the [handoff](../RESUME.md). `PRESET-012` remains
partial despite passing date-source/fallback evidence because invalid-date inputs
are untested. `PRESET-008` receives no credit from its narrower manual-angle case.
`ACTION-012` explicitly uses supported JSON geographic reporting rather than
claiming a separate geographic aggregate UI.

## Executed validation

**265/265 passed, zero retries and zero skips** in the final combined run, using three workers,
zero automatic retries and retained failure traces:

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/playwright/reports/coverage-60-combined-final'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --workers=3 --output=.local/playwright/coverage-60-combined-final-results --trace=retain-on-failure
```

Scope: all 256 Chromium behavior cases, four smoke cases each in Firefox/WebKit,
and one authentication setup. Legacy imported-mission/map tests are not included;
this is not a claim of full unfiltered Playwright or CI acceptance.

`npm run test:all` passed full JS/CSS lint, TypeScript, production build,
**145 unit-test files / 2,103 tests**, and **42 browser-component files / 399 tests**.
The generated report and discovery freshness check passed with all 81 registered
surfaces assigned. `git diff --check` passed. No retries, skip/fixme gates, blanket
timeout increases or changed Playwright configuration were introduced.

## Behavior and defect evidence

- Action tests cover POI/station/traverse create/edit/duplicate/delete ownership,
  exact peer/reload ordering, text/task/icon content, both action versions, full
  template field/identity round trips and real viewer/editor/admin restrictions.
  Definition usage checks include every parent, templates and STM rules. Status
  tests exercise Edit off, viewer, disabled, stopped and Maestro-controlled states.
- Resource tests independently check disabled work, crew/mass/consumable totals,
  1.2-minute rounding, zero/negative imported versus UI duration rules, strict
  override ratios, empty/extreme values and missing/zero/nonzero executed mass.
- New transport cases close only Automerge while observing live HTTP/Socket.IO,
  or close both sockets with repeated failed version polls. Real server messages
  are buffered during recovery to delay readiness; Edit/Save stay gated, peer
  changes catch up without navigation and later writes persist through reload.
- Map cases check pointer/control/zoom/resize/remount behavior, exact QuickMap URL
  geometry across five entry points, SPICE celestial expectations in Mercator and
  polar projections, source-filtered latest positions, minimap ownership/bounds,
  and peer changes to local follow settings.
- The UTC reproducer enabled editing on both clients. Before the fix, a saved
  `2025-02-20` reverted to `2024-01-02`; after the fix, explicit date/time saves
  converge without effect-driven stale writes. An additional empty-input case
  confirms partial entry and Cancel behavior.
- The comparison matrix reproduced an equal travel delta rendering `−0` instead
  of `=`. All 22 metrics now run across four baselines including equal travel
  totals; text, tint, tooltip and differences-only filtering agree. Small real
  differences remain distinct in unit regression.
- Selected historical deletion previously left an execution-only tab empty on a
  peer. Both clients now restore the planned information automatically, while
  exact owned-graph deletion and unrelated REX preservation remain asserted.
- Traverse work previously offset calculated clocks by five minutes in a
  ten-minute movement/five-minute dwell fixture. Removing a duplicate increment
  makes calculated and resolved clocks both span 0–900 seconds.
- Zero subdivision spacing with nonzero geometry caused an infinite timeline
  loop. A finite-positive-spacing guard preserves the original path and keeps
  the browser responsive; nonfinite/nonpositive unit cases are also covered.
- Comparison accumulators previously converted missing executed mass into zero.
  EVA and sequence totals now retain unknown/null until a numeric value exists;
  an explicit zero remains recorded zero, with gram/kg boundaries checked.
- Follow options previously reset Stations/Traverses to checked after a peer
  renamed a position type. The provider preserves those local choices and
  rebuilds options for empty type lists. The regression uses real peer rename
  and final-position deletion controls.

## Development failures and retained artifacts

An early API watch rebuild changed the epoch during tests, invalidating in-flight
fixtures. Validation then used a stable API process and Vite. One interrupted
isolated mission was verified by exact test identity and removed through the
application API; unrelated missions were untouched.

The first combined run caught a celestial test reloading after local manual-mode
rendering but before authoritative persistence. A server-state poll was added
before reload. Both projection variants then passed twice with three workers,
zero retries, before the final combined run. Other development corrections fixed
fixture shapes, scoped selectors, dialog-shell visibility assertions, menu
placement and animation-aware zoom limits. No application behavior was bypassed.

| Local ignored evidence                                                                                                                                            | Purpose                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `.local/playwright/reports/coverage-60-combined-final/`                                                                                                           | Final combined browser result                                  |
| `.local/playwright-60-combined-final.log`                                                                                                                         | Complete final browser output                                  |
| `.local/playwright/reports/coverage-60-combined/`                                                                                                                 | First combined run and celestial persistence race              |
| `.local/playwright/reports/coverage60-celestial-reload-confirm/`                                                                                                  | Corrected projection cases, two repetitions with three workers |
| `.local/playwright-60-test-all-final.log`                                                                                                                         | Full lint/type/build/unit/browser-component acceptance         |
| `.local/playwright/reports/coverage-60-known-defects/`                                                                                                            | UTC rollback and execution-tab development failures            |
| `.local/playwright/reports/coverage-60-signed-zero-before/`                                                                                                       | Equal travel difference rendered as negative zero              |
| `.local/playwright/reports/coverage-60-root-verified/`                                                                                                            | Fifteen-case UTC/REX/report/transport focused confirmation     |
| `.local/playwright/reports/coverage-60-transport-verified/`                                                                                                       | Expanded socket/polling/delayed-readiness cases                |
| `.local/playwright/reports/coverage-60-entities-v4/`, `.local/playwright/reports/coverage-60-entities-corrections/`                                               | Action/reference/policy cases and final corrections            |
| `.local/playwright/reports/60-calculations-final/`                                                                                                                | Nine-case calculation/resource confirmation                    |
| `.local/playwright/reports/coverage60-map-final/`, `.local/playwright/reports/coverage60-map-targeted/`, `.local/playwright/reports/coverage60-follow-ui-delete/` | Map/preset/follow cases and final corrected assertions         |
| `.local/playwright/reports/coverage60-follow-before/`                                                                                                             | Follow settings reset before the provider fix                  |

These browser failures are natural development/regression evidence; no separate
production mutation campaign was performed in this batch. Prior mutation evidence
remains in the 2026-10-24 records. No pipeline was triggered or MR marked Ready.

# Resume Playwright coverage work

Last updated: **2026-10-25**. The [catalog](scenario-catalog.json) preserves the
reviewed scenario contracts; the generated [coverage report](coverage.md)
contains the reviewed test mappings.

## Executed 90% checkpoint

Branch: `codex/playwright-behavioral-baseline`, following `1415ddd73`.
Eight Luna subagents expanded coverage in small assignments. The coordinator
reviewed mappings and source changes, maintained the gate and ran validation
without building specific tests.

| Measure                                   | Before          | Current             |
| ----------------------------------------- | --------------- | ------------------- |
| Complete eligible scenarios               | 156/253 (61.7%) | **228/253 (90.1%)** |
| Complete P0 scenarios                     | 87/146 (59.6%)  | **128/146 (87.7%)** |
| Chromium behavior cases                   | 256             | **370**             |
| Combined behavior, browser smoke and auth | 265             | **379**             |

Added **114 Chromium behavior cases in 48 new specs** and completed 72 additional
scenario mappings. The inventory remains 260 rows with the same 253 eligible
scenarios; five mappings remain partial, 20 are gaps and seven are external.
Scenario titles, priorities, actions, expected outcomes and fixture contracts
are unchanged. The percentage measures reviewed mappings, not code coverage.

Combined validation passed **379/379 cases, zero retries and zero skips**.
`npm run test:all` passed lint, TypeScript, production build, **2,103 unit tests**
and **399 browser component tests**. Formatting, report freshness, unchanged
catalog contracts and the exact 90% gate passed.

See the [ninety-percent validation record](runs/2026-10-25-ninety-percent-coverage.md)
for commands, scope, repaired defects, environment requirements and retained
failure evidence. The [sixty-percent record](runs/2026-10-25-sixty-percent-coverage.md)
preserves the prior checkpoint.

## Scope sweep and current mapping

The 2026-10-25 follow-up used three disposable Luna reviewers for requirements,
remaining behavioral gaps, and coverage structure. The coordinator reviewed the
referenced assertions. This was a catalog/documentation sweep; no application or
test code changed and no browsers were executed again.

Current mapping is **232/253 (91.7%)**, with **131/146 P0 (89.7%)**. All 260 IDs
remain: 232 mapped, three partial, 18 gaps, seven external. The increase of four
comes from reviewed contract corrections, not new tests or new executed evidence:

- `AUTH-005` and `ADMIN-005`: the user explicitly accepts writes from already-open
  Automerge sockets after grant removal. Existing tests establish grant changes,
  escalation denial and revoked HTTP access in existing/fresh sessions. Live
  socket revocation is not required. Initial socket authorization remains separate.
- `PRESET-002`: SunDegrees offers a Save/Cancel draft; layer/circle controls write
  immediately. Existing assertions cover both semantics, peers and persistence.
  A shared draft transaction was an unsupported catalog assumption.
- `MEASURE-005`: real API validation failures plus injected 503/success responses
  establish browser error handling and recovery. Inducing a worker-pool failure
  is not required to prove that bounded response-handling contract.

`AUTH-002` is now partial, acknowledging its existing viewer read/HTTP denial
evidence without claiming the full geometry/execution/transport matrix. The other
partial rows remain `COLLAB-008` and `ACCESS-003`.

Two further expectations were corrected without closing their gaps. `REX-026`
requires convergent valid REX state and the existing observed-state start gate;
the UI check does not establish a distributed single-winner guarantee.
`ADMIN-010` tests the declared environment URL override and EMSS flag contracts;
there is no established secret-redaction policy for the current URL setting.
`COLLAB-014` follows the same accepted socket-revocation policy as `AUTH-005`.

## Next batches toward 100%

Each row below needs explicit assertions before promotion. Preserve the current
IDs and denominator; record any further contract correction with its evidence.
Scope matrices enumerate supported cases, rather than creating requirements
from every possible combination.

| Batch                            | Remaining IDs                                          | Concrete work and boundary                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial permissions              | `AUTH-002`, `AUTH-003`, `AUTH-004`                     | Finish viewer UI/direct-write checks, editor A versus mission B API/socket isolation, and a route-role matrix derived from declared admin policies. Group equivalent policies; keep super-admin distinctions. Do not require live revocation of existing sockets.                                                                     |
| Admin mission data               | `ADMIN-002`, `ADMIN-003`, `ADMIN-004`                  | Disposable mission copy identity/assets/failure, layer and supported sublayer CRUD/import, valid/invalid STM import. Check source preservation, references and persistence.                                                                                                                                                           |
| Files and provider               | `ADMIN-006`, `ADMIN-007`                               | Owned temporary file bytes/list/rename/delete/path failures; deterministic Box folder/download/error fixtures at the provider boundary. Live Box credentials or real provider outages are not prerequisites for browser contract tests.                                                                                               |
| Configuration                    | `ADMIN-010`                                            | Enumerate current `CONFIG_LIST` and EMSS GET/POST policy, validate override/reset/unknown key/boolean cases, and restore isolated settings. Use disposable configuration values.                                                                                                                                                      |
| HTTP contract accounting         | `INTEGRATION-009`                                      | Build a finite handler/method-policy matrix from the surface appendix and reuse reviewed browser references where they prove a contract. List relevant missing-resource/invalid-input cases by handler; do not presume every endpoint accepts the same inputs or needs every role combination. Unit tests remain supporting evidence. |
| Collaboration and durability     | `COLLAB-008`, `COLLAB-011`, `COLLAB-013`, `COLLAB-014` | Complete named duplicate/cascade-delete graph operations; use a disposable process for epoch/restart and durable-write recovery; connect distinct editor/viewer users for presence/disconnect. Restart cases share a harness and may share evidence, but assert their different outcomes.                                             |
| Raster and execution concurrency | `PRESET-004`, `REX-026`                                | Name supported source/projection pairs with known geographic oracles; test two-client execution-start convergence and the observed-state UI gate. No implied all-projection Cartesian product or globally serialized start.                                                                                                           |
| Browser and accessibility        | `ACCESS-001` through `ACCESS-005`                      | Name representative editor/dashboard dialogs, responsive layouts, statuses and native input/download workflows. Add focused Firefox/WebKit execution beyond smoke for the declared parity cases. Keep real visual/geometry and keyboard/focus assertions; do not promote from canvas visibility alone.                                |

The scanner and exact-count gates are appropriate for mapping maintenance; they
do not verify assertions or execution. Files named `*90.spec.ts` remain valid
capability tests; future specs should use capability names rather than milestone
percentages. Avoid a wholesale rename during closure. The registration scanner
supports current literal routes and default-import mounted routers; named imports
and dynamic mounts need explicit scanner support/review if introduced.

Sweep validation passed report regeneration, the exact 90% freshness/discovery
gate, Prettier and `git diff --check`. The complete gate still fails as expected
with the 21 remaining rows. Browser execution and `test:all` were not rerun for
these catalog/documentation edits; the 379-case result above belongs to the
earlier executed checkpoint.

## Commands and environment

Use current dependencies and browser binaries, the normal local environment, and
local PostgreSQL schema and migrations. Tests create and delete isolated missions
and disposable role accounts. DUST integration cases require `DUST_TOKEN` in the
ignored local `.env` (declared in `.env.template`).

Use one stable built API and Vite server for parallel focused runs; API watch
restarts invalidate every active fixture's server epoch. Confirm sustained API
and proxy readiness plus a fresh login page before the combined run. Use unique
report and result directories for concurrent runs.

```powershell
$env:PLAYWRIGHT_REPORT_DIR='.local/coverage90/final-verified-report'
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts behavior --project=chromium --project=firefox --project=webkit --workers=3 --retries=0 --trace=retain-on-failure --output=.local/coverage90/final-verified-results

npm run docs:playwright-scenarios
npm run test:playwright:scenarios:90
npm run test:all
git diff --check
```

The 90% gate checks report freshness and the exact unrounded mapping fraction;
report generation executes no browser tests. All 81 registered surfaces are
assigned. Every mapped test reference belongs to the combined scope: all Chromium
behavior tests, four smoke cases each in Firefox/WebKit, and authentication.
Legacy imported-mission/map suites are outside this acceptance scope. Before
finishing an MR, follow [CLAUDE.md](../../CLAUDE.md#before-finishing-a-merge-request).
No commit, push, pipeline or MR-state change was made.

## Fixture lessons

- Arrange schema-valid state with `mission.change()`; verify outcomes through
  visible UI, authoritative persistence, peer clients and fresh loads as relevant.
- Wait for server persistence after UI saves before arranging more fixture state.
  A locally rendered value is not a server acknowledgment.
- Use small generated DEMs for owned terrain fixtures. New entity, station and EVA
  tests avoid copying the multi-gigabyte imported mission asset.
- Scope repeated action/station locators to the intended planning or execution
  sequence. Do not hide ambiguity with retries or forced interactions.
- Keep role contexts separate, refresh persisted grants before client repair, and
  recheck the active document after asynchronous permission checks.
- Validate candidate projections before replacing a working map. Invalid drafts
  must leave the prior map available; local and polar CRS checks use the actual
  region of interest rather than an arbitrary global origin.

Current ignored evidence is under `.local/coverage90/`; the validation record
names the logs and reports. These artifacts may be absent on a fresh checkout.

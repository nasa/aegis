# Execution edit policies, status and collected values

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Original and added station/traverse/actions under never-run, running, stopped and restarted REXes in none/limited/unrestricted modes.

Source: [src/utils/rexExecuteEditMode.ts](../../../src/utils/rexExecuteEditMode.ts), [src/operations/apply/apply-rex.ts](../../../src/operations/apply/apply-rex.ts).

Scenario mapping: **3/9 (33.3%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/utils/rexExecuteEditMode.test.ts](../../../src/tests/vitest/utils/rexExecuteEditMode.test.ts), [src/tests/vitest/operations/apply/apply-rex.test.ts](../../../src/tests/vitest/operations/apply/apply-rex.test.ts).

## POLICY-001: Policy selection and first-start freeze

**P0 · Mapped**

Action: Choose each policy before first start; start, stop and restart; attempt changing the policy later.

Expected: First start freezes the chosen policy and original action baseline; stop/restart preserves both.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:151](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L151) — first execution freezes none policy and its action baseline across stop, restart and reload (chromium).

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:151](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L151) — first execution freezes limited policy and its action baseline across stop, restart and reload (chromium).

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:151](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L151) — first execution freezes unrestricted policy and its action baseline across stop, restart and reload (chromium).

## POLICY-002: Limited original entity edit matrix

**P0 · Partial**

Action: On original station/traverse/actions attempt duration/path/sequence/crew/enabled changes and protected general/location/delete fields.

Expected: Only the declared limited-mode operations succeed; blocked mutations leave persisted data unchanged after reload.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:277](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L277) — limited execution permits crew and enabled changes but protects original action wording, duration and deletion (chromium).

Evidence boundary: Original action wording/duration/duplicate/delete protection, crew changes and deactivation are exercised in a running limited REX with reload and planning-copy independence. The original station/traverse location/path/duration/sequence matrix still needs coverage.

## POLICY-003: Limited newly added entity edit matrix

**P0 · Gap**

Action: Add stations/traverses/actions during limited execution and edit/duplicate/delete them.

Expected: Added-entity exemptions work within limited mode and do not affect original entities or planning copies.

## POLICY-004: None unrestricted and planned scope

**P0 · Gap**

Action: Repeat protected operations under None and Unrestricted and on the original plan and POI actions.

Expected: None blocks applicable edits including added entities; unrestricted works; planned/POI scope follows ordinary permissions.

## POLICY-005: Stable original and added action letters

**P0 · Gap**

Action: Reorder/remove original and added actions under original and newly added parents; restart and reload.

Expected: Original letters follow action identity, removed letters do not compact, and new-parent labels use the correct added numbering.

## POLICY-006: Execution item status lifecycle

**P0 · Mapped**

Action: Set Pending/In-Progress/Complete/Skipped on station, traverse and action through each available view.

Expected: The running REX's entries and all status displays update and persist while planned and historical copies remain unchanged.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:204](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L204) — station, traverse and action statuses cycle without global Edit and preserve historical and planned data (chromium).

## POLICY-007: Status permission and Maestro ownership

**P0 · Gap**

Action: Change status with global Edit off, as viewer, on disabled actions and with Maestro control on.

Expected: Controls follow mission permission/running/ownership rules; Maestro-controlled clicks explain the gate and do not persist local status writes.

## POLICY-008: Executed mass and sample value merge

**P0 · Mapped**

Action: Enter absent/zero/nonzero mass and sample identifiers alongside status updates from a peer.

Expected: Execution entry updates preserve unrelated fields, respect Maestro-controlled fields and show correct executed/delta mass after reload.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:52](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L52) — executed mass and sample IDs merge with peer status changes and respect Maestro ownership (chromium).

## POLICY-009: Maestro completion display override

**P1 · Gap**

Action: Receive 100-percent crew completion and compare stored status, sequence colors and dashboard.

Expected: Displayed completion follows the integration contract without silently rewriting stored status.

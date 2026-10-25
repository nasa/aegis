# Execution edit policies, status and collected values

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Original and added station/traverse/actions under never-run, running, stopped and restarted REXes in none/limited/unrestricted modes.

Source: [src/utils/rexExecuteEditMode.ts](../../../src/utils/rexExecuteEditMode.ts), [src/operations/apply/apply-rex.ts](../../../src/operations/apply/apply-rex.ts).

Scenario mapping: **9/9 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/utils/rexExecuteEditMode.test.ts](../../../src/tests/vitest/utils/rexExecuteEditMode.test.ts), [src/tests/vitest/operations/apply/apply-rex.test.ts](../../../src/tests/vitest/operations/apply/apply-rex.test.ts).

## POLICY-001: Policy selection and first-start freeze

**P0 · Mapped**

Action: Choose each policy before first start; start, stop and restart; attempt changing the policy later.

Expected: First start freezes the chosen policy and original action baseline; stop/restart preserves both.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:151](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L151) — first execution freezes none policy and its action baseline across stop, restart and reload (chromium).

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:151](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L151) — first execution freezes limited policy and its action baseline across stop, restart and reload (chromium).

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:151](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L151) — first execution freezes unrestricted policy and its action baseline across stop, restart and reload (chromium).

## POLICY-002: Limited original entity edit matrix

**P0 · Mapped**

Action: On original station/traverse/actions attempt duration/path/sequence/crew/enabled changes and protected general/location/delete fields.

Expected: Only the declared limited-mode operations succeed; blocked mutations leave persisted data unchanged after reload.

Playwright: [src/tests/playwright/behavior/limitedPolicy.spec.ts:35](../../../src/tests/playwright/behavior/limitedPolicy.spec.ts#L35) — limited mode edits original station and traverse duration/path/sequence while blocking protected fields (chromium).

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:277](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L277) — limited execution permits crew and enabled changes but protects original action wording, duration and deletion (chromium).

Evidence boundary: Limited REX UI verifies original station/traverse duration, traverse reset path and sequence reordering succeed; protected station name/location controls and original action wording/duration/delete stay blocked. The existing action matrix covers crew/enabled changes and persists data through reload.

## POLICY-003: Limited newly added entity edit matrix

**P0 · Mapped**

Action: Add stations/traverses/actions during limited execution and edit/duplicate/delete them.

Expected: Added-entity exemptions work within limited mode and do not affect original entities or planning copies.

Playwright: [src/tests/playwright/behavior/limitedPolicy.spec.ts:101](../../../src/tests/playwright/behavior/limitedPolicy.spec.ts#L101) — limited additions register editable station/traverse/actions and cleanly delete their copies (chromium).

Evidence boundary: Limited REX UI adds an EVA station slot from a spare planning station, verifies added station/traverse registration, edits station name/duration/location and traverse path/duration, creates/edits/duplicates/deletes an action, then removes the added station/traverse and confirms planning entities are unchanged.

## POLICY-004: None unrestricted and planned scope

**P0 · Mapped**

Action: Repeat protected operations under None and Unrestricted and on the original plan and POI actions.

Expected: None blocks applicable edits including added entities; unrestricted works; planned/POI scope follows ordinary permissions.

Playwright: [src/tests/playwright/behavior/policyScopes.spec.ts:71](../../../src/tests/playwright/behavior/policyScopes.spec.ts#L71) — None blocks original and added REX action edits (chromium).

Playwright: [src/tests/playwright/behavior/policyScopes.spec.ts:111](../../../src/tests/playwright/behavior/policyScopes.spec.ts#L111) — Unrestricted mode edits and duplicates/deletes a protected original action (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:117](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L117) — poi action creation, editing, duplication and deletion preserve exact parent ownership (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:117](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L117) — station action creation, editing, duplication and deletion preserve exact parent ownership (chromium).

Evidence boundary: Running REX None mode exposes no add, wording, duration, enabled, duplicate or delete controls on original or a registered added action; persisted action/state remains unchanged after reload. Unrestricted REX mode saves protected original wording and duration, duplicates then deletes a copy, and retains edits after reload. Existing real planned POI and station action matrices provide ordinary create/edit/duplicate/delete permission evidence.

## POLICY-005: Stable original and added action letters

**P0 · Mapped**

Action: Reorder/remove original and added actions under original and newly added parents; restart and reload.

Expected: Original letters follow action identity, removed letters do not compact, and new-parent labels use the correct added numbering.

Playwright: [src/tests/playwright/behavior/policyScopes.spec.ts:155](../../../src/tests/playwright/behavior/policyScopes.spec.ts#L155) — limited action letters follow identity across reorder, removal, new parent, restart and reload (chromium).

Evidence boundary: Limited REX UI action rows show baseline letters attached to action identities across drag reorder; removal of a middle baseline UUID preserves the surviving letter gap, added actions on an original parent take subsequent letters, and an added parent uses 0+ positional labels through reorder/removal. Stop/restart, reload and persisted order/state retain those labels and ownership.

## POLICY-006: Execution item status lifecycle

**P0 · Mapped**

Action: Set Pending/In-Progress/Complete/Skipped on station, traverse and action through each available view.

Expected: The running REX's entries and all status displays update and persist while planned and historical copies remain unchanged.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:204](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L204) — station, traverse and action statuses cycle without global Edit and preserve historical and planned data (chromium).

## POLICY-007: Status permission and Maestro ownership

**P0 · Mapped**

Action: Change status with global Edit off, as viewer, on disabled actions and with Maestro control on.

Expected: Controls follow mission permission/running/ownership rules; Maestro-controlled clicks explain the gate and do not persist local status writes.

Playwright: [src/tests/playwright/behavior/actionStatusPermissionCoverage.spec.ts:30](../../../src/tests/playwright/behavior/actionStatusPermissionCoverage.spec.ts#L30) — execution action status requires editor and running ownership, permits Edit off, and rejects disabled and Maestro controlled writes (chromium).

## POLICY-008: Executed mass and sample value merge

**P0 · Mapped**

Action: Enter absent/zero/nonzero mass and sample identifiers alongside status updates from a peer.

Expected: Execution entry updates preserve unrelated fields, respect Maestro-controlled fields and show correct executed/delta mass after reload.

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:52](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L52) — executed mass and sample IDs merge with peer status changes and respect Maestro ownership (chromium).

## POLICY-009: Maestro completion display override

**P1 · Mapped**

Action: Receive 100-percent crew completion and compare stored status, sequence colors and dashboard.

Expected: Displayed completion follows the integration contract without silently rewriting stored status.

Playwright: [src/tests/playwright/behavior/executionClock.spec.ts:184](../../../src/tests/playwright/behavior/executionClock.spec.ts#L184) — Maestro 100 percent crew completion overrides display while retaining the stored status (chromium).

Evidence boundary: A real Maestro MDAU supplies pending status with 100 percent completion for both crew. The execution row shows the Complete tooltip and completed name color, the dashboard activity uses the completed color, and persisted status remains pending.

# Execution lifecycle and PET ownership

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Execution fixture: stopped Alpha PET +02:10:05 with position +01:55:05; active paused Bravo PET +00:05:00 with position +00:02:00; controlled browser Date.

Source: [src/components/panes/rex/rex-right-rex-info.tsx](../../../src/components/panes/rex/rex-right-rex-info.tsx), [src/store/thunk/thunkRex.ts](../../../src/store/thunk/thunkRex.ts), [src/components/interface/map/hooks/useRexPetTime.ts](../../../src/components/interface/map/hooks/useRexPetTime.ts).

Scenario mapping: **25/27 (92.6%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/rex_thunk.test.ts](../../../src/tests/vitest/store/thunks/rex_thunk.test.ts), [src/tests/vitest/map/useRexPetTime.test.tsx](../../../src/tests/vitest/map/useRexPetTime.test.tsx).

## REX-001: stopped execution keeps its historical position age with no execution running

**P0 · Mapped**

Action: stopped execution keeps its historical position age with no execution running

Expected: With no active execution, stopped Alpha retains PET +02:10:05 and position age +00:15:00 after reload.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:96](../../../src/tests/playwright/behavior/execution.spec.ts#L96) — stopped execution keeps its historical position age with no execution running (chromium).

## REX-002: stopped execution keeps its historical position age with another execution running

**P0 · Mapped**

Action: stopped execution keeps its historical position age with another execution running

Expected: With Bravo active, stopped Alpha retains age +00:15:00 while the header displays Bravo PET +00:05:00, including after reload.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:96](../../../src/tests/playwright/behavior/execution.spec.ts#L96) — stopped execution keeps its historical position age with another execution running (chromium).

## REX-003: switching executions A → B → A changes labels without leaking the other clock

**P0 · Mapped**

Action: switching executions A → B → A changes labels without leaking the other clock

Expected: Switching A/B/A shows ages +00:15:00/+00:03:00/+00:15:00 and removes positions belonging to the other execution.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:121](../../../src/tests/playwright/behavior/execution.spec.ts#L121) — switching executions A → B → A changes labels without leaking the other clock (chromium).

## REX-004: switching from historical execution to its plan removes execution position labels

**P0 · Mapped**

Action: switching from historical execution to its plan removes execution position labels

Expected: Switching from historical Alpha to its plan removes REX information and all execution position labels.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:145](../../../src/tests/playwright/behavior/execution.spec.ts#L145) — switching from historical execution to its plan removes execution position labels (chromium).

## REX-005: paused running execution keeps its PET and position ages fixed as time passes

**P0 · Mapped**

Action: paused running execution keeps its PET and position ages fixed as time passes

Expected: Advancing Date by 120 seconds leaves paused Bravo PET +00:05:00 and age +00:03:00 fixed across native timer ticks.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:163](../../../src/tests/playwright/behavior/execution.spec.ts#L163) — paused running execution keeps its PET and position ages fixed as time passes (chromium).

## REX-006: stopped execution stays frozen while a different execution's clock advances

**P0 · Mapped**

Action: stopped execution stays frozen while a different execution's clock advances

Expected: Advancing another execution clock changes its header while stopped Alpha PET and position age remain frozen.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:180](../../../src/tests/playwright/behavior/execution.spec.ts#L180) — stopped execution stays frozen while a different execution's clock advances (chromium).

## REX-007: PET crosses zero without resetting position ages

**P0 · Mapped**

Action: PET crosses zero without resetting position ages

Expected: PET crosses -00:00:05 to +00:00:05 without resetting the seeded position age.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:206](../../../src/tests/playwright/behavior/execution.spec.ts#L206) — PET crosses zero without resetting position ages (chromium).

## REX-008: PET crosses an hour without resetting position ages

**P0 · Mapped**

Action: PET crosses an hour without resetting position ages

Expected: PET crosses +00:59:55 to +01:00:05 without resetting the seeded position age.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:206](../../../src/tests/playwright/behavior/execution.spec.ts#L206) — PET crosses an hour without resetting position ages (chromium).

## REX-009: play, pause and resume advance only unpaused PET and persist the paused value

**P0 · Mapped**

Action: play, pause and resume advance only unpaused PET and persist the paused value

Expected: Play/pause/resume advances only running intervals; +00:05:15 and its corresponding position age persist after reload.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:230](../../../src/tests/playwright/behavior/execution.spec.ts#L230) — play, pause and resume advance only unpaused PET and persist the paused value (chromium).

## REX-010: stopping execution also freezes its running PET and removes the live dashboard

**P0 · Mapped**

Action: stopping execution also freezes its running PET and removes the live dashboard

Expected: Stopping after 20 seconds saves isRunning=false, petRunning=false and +00:05:20; clocks freeze and the open dashboard removes its maps/clock.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:267](../../../src/tests/playwright/behavior/execution.spec.ts#L267) — stopping execution also freezes its running PET and removes the live dashboard (chromium).

## REX-011: another executing REX prevents starting the historical execution

**P0 · Mapped**

Action: another executing REX prevents starting the historical execution

Expected: Bravo running blocks Execute for historical Alpha and preserves both execution running states.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:309](../../../src/tests/playwright/behavior/execution.spec.ts#L309) — another executing REX prevents starting the historical execution (chromium).

## REX-012: starting a stopped REX publishes its own frozen PET to an already-open dashboard

**P0 · Mapped**

Action: starting a stopped REX publishes its own frozen PET to an already-open dashboard

Expected: Starting Alpha makes an already-open empty dashboard display Alpha PET +02:10:05 and age +00:15:00 without borrowing Bravo time.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:328](../../../src/tests/playwright/behavior/execution.spec.ts#L328) — starting a stopped REX publishes its own frozen PET to an already-open dashboard (chromium).

## REX-013: execution controls stay unavailable until Edit mode is enabled

**P0 · Mapped**

Action: execution controls stay unavailable until Edit mode is enabled

Expected: View mode prevents Stop, PET Play and PET editing; enabling Edit exposes the appropriate execution controls.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:359](../../../src/tests/playwright/behavior/execution.spec.ts#L359) — execution controls stay unavailable until Edit mode is enabled (chromium).

## REX-014: saving a nonzero historical PET updates its position age and survives reload

**P0 · Mapped**

Action: saving a nonzero historical PET updates its position age and survives reload

Expected: Saving historical PET updates its corresponding position age and the exact saved value survives reload.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:379](../../../src/tests/playwright/behavior/execution.spec.ts#L379) — saving a nonzero historical PET updates its position age and survives reload (chromium).

## REX-015: Cancel preserves historical PET and labels in the document and after reload

**P0 · Mapped**

Action: Cancel preserves historical PET and labels in the document and after reload

Expected: Canceling historical PET editing preserves document PET and visible position labels after reload.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:401](../../../src/tests/playwright/behavior/execution.spec.ts#L401) — Cancel preserves historical PET and labels in the document and after reload (chromium).

## REX-016: invalid PET format cannot replace the saved time

**P0 · Mapped**

Action: invalid PET format cannot replace the saved time

Expected: Malformed PET cannot replace the saved time and leaves the invalid dialog open until canceled.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:422](../../../src/tests/playwright/behavior/execution.spec.ts#L422) — invalid PET format cannot replace the saved time (chromium).

## REX-017: invalid PET empty value cannot replace the saved time

**P0 · Mapped**

Action: invalid PET empty value cannot replace the saved time

Expected: Empty PET cannot replace the saved time and leaves the invalid dialog open until canceled.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:422](../../../src/tests/playwright/behavior/execution.spec.ts#L422) — invalid PET empty value cannot replace the saved time (chromium).

## REX-018: cancelling reset preserves the PET

**P0 · Mapped**

Action: cancelling reset preserves the PET

Expected: Dismissing Reset confirmation preserves the saved PET and position age.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:443](../../../src/tests/playwright/behavior/execution.spec.ts#L443) — cancelling reset preserves the PET (chromium).

## REX-019: confirming reset sets PET to zero

**P0 · Mapped**

Action: confirming reset sets PET to zero

Expected: Accepting Reset confirmation saves PET zero and the corresponding position age.

Playwright: [src/tests/playwright/behavior/execution.spec.ts:443](../../../src/tests/playwright/behavior/execution.spec.ts#L443) — confirming reset sets PET to zero (chromium).

## REX-020: adding and deleting a REX preserves its planned EVA and gives the execution scoped identities

**P0 · Mapped**

Action: adding and deleting a REX preserves its planned EVA and gives the execution scoped identities

Expected: Adding REX allocates a deep execution tree with new UUIDs and retained planning lineage; deleting it restores the original plan graph and selection.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:458](../../../src/tests/playwright/behavior/planning.spec.ts#L458) — adding and deleting a REX preserves its planned EVA and gives the execution scoped identities (chromium).

## REX-021: First execution seeds initial positions

**P0 · Mapped**

Action: Start a never-executed REX with several position sources/types, stop and start again.

Expected: Initial positions are seeded once at egress with the correct PET/types; restart does not duplicate them or change planning entities.

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:67](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L67) — first start seeds one egress position per configured source and restart reuses them (chromium).

Evidence boundary: First start seeds one egress/PET-zero entry for every configured source with every type, exact entries survive stop/start and planning data remains unchanged.

## REX-022: REX names metadata and controlled mode

**P1 · Mapped**

Action: Rename two REXes in one EVA family; edit Maestro control; cancel and reload.

Expected: Name uniqueness is family-scoped, immutable copied EVA name remains protected and control metadata persists.

Playwright: [src/tests/playwright/behavior/rexMetadata.spec.ts:22](../../../src/tests/playwright/behavior/rexMetadata.spec.ts#L22) — REX names are family-scoped and Maestro control persists without renaming the copied EVA (chromium).

Evidence boundary: Two REXes in one EVA family are renamed independently; empty and case-insensitive duplicate saves are rejected, another family name is allowed, Cancel preserves data, and Maestro control persists on a peer and after reload without renaming copied EVA data.

## REX-023: Running-only view and remote stop

**P0 · Mapped**

Action: Enable Show only Executing EVA; stop remotely and start another REX.

Expected: Selection/list scope follows the active execution and remote stop clears running-only mode without stale controls.

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:156](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L156) — remote stop exits running-only mode, restores the list and removes stale stop controls (chromium).

Evidence boundary: Running-only scope follows the executing REX, remote stop clears the mode/list restriction and stale controls, a different remote execution appears and reload restores correct stop controls.

## REX-024: PET manual edit complete boundary matrix

**P0 · Mapped**

Action: Edit positive, negative, zero, long-hour and out-of-range minute/second values; test typing and length limits.

Expected: Format, numeric semantics and rejection follow the actual field contract; no cross-execution clock changes occur.

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:239](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L239) — accepts positive PET according to the field's format and numeric semantics (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:239](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L239) — accepts negative PET according to the field's format and numeric semantics (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:239](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L239) — accepts zero PET according to the field's format and numeric semantics (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:239](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L239) — accepts maximum two-digit hour PET according to the field's format and numeric semantics (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:239](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L239) — accepts minute and second values above 59 PET according to the field's format and numeric semantics (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:239](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L239) — accepts typing filters non-time characters PET according to the field's format and numeric semantics (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:285](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L285) — rejects an invalid PET hour exceeds the two-digit maximum without replacing committed clocks (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:285](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L285) — rejects an invalid PET value exceeds nine-character input limit without replacing committed clocks (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:285](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L285) — rejects an invalid PET incomplete field without replacing committed clocks (chromium).

Playwright: [src/tests/playwright/behavior/executionCoverage.spec.ts:285](../../../src/tests/playwright/behavior/executionCoverage.spec.ts#L285) — rejects an invalid PET empty field without replacing committed clocks (chromium).

Evidence boundary: Positive/negative/zero, long-hour, overflow minute/second, filtering, length and rejected-format cases assert PET semantics, historical age clamp, saved/reloaded value and other-execution isolation.

## REX-025: Server-time offset and clock skew

**P0 · Gap**

Action: Keep real server-time correction enabled; inject positive/negative skew and reconnect around PET boundaries.

Expected: Displayed PET and position ages use the agreed server offset exactly once and remain coherent across clients.

## REX-026: Simultaneous execution starts

**P0 · Gap**

Action: Have two clients attempt to start different stopped REXes concurrently.

Expected: The agreed single-active-execution invariant holds after synchronization and reload; any race is exposed explicitly.

## REX-027: Historical execution deletion and selected cleanup

**P0 · Mapped**

Action: Cancel and confirm deleting the selected stopped REX while another client views it.

Expected: Only its owned execution graph disappears; both clients fall back safely to the plan and unrelated REXes remain unchanged.

Playwright: [src/tests/playwright/behavior/rexMetadata.spec.ts:96](../../../src/tests/playwright/behavior/rexMetadata.spec.ts#L96) — deleting a selected historical REX preserves its graph boundaries and clears stale controls with no active REX (chromium).

Playwright: [src/tests/playwright/behavior/rexMetadata.spec.ts:96](../../../src/tests/playwright/behavior/rexMetadata.spec.ts#L96) — deleting a selected historical REX preserves its graph boundaries and clears stale controls with another REX active (chromium).

Evidence boundary: Cancel preserves the full graph; confirmation deletes exactly the selected stopped execution graph. Both author and live peer restore planned information automatically from an execution-only tab, with no stale dropdown/control; unrelated execution and subsequent reload are checked.

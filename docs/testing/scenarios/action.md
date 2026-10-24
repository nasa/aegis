# Action editing, reuse and ownership

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning mission with a station action, empty second station, linked POI and both action-system versions.

Source: [src/components/panes/actions-action-menu.tsx](../../../src/components/panes/actions-action-menu.tsx), [src/operations/apply/apply-action.ts](../../../src/operations/apply/apply-action.ts).

Scenario mapping: **5/14 (35.7%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/operations/apply/apply-action.test.ts](../../../src/tests/vitest/operations/apply/apply-action.test.ts), [src/tests/vitest/store/thunks/action_thunk.test.ts](../../../src/tests/vitest/store/thunks/action_thunk.test.ts).

## ACTION-001: view mode protects action fields, crew assignments, and creation until editing is enabled

**P1 · Mapped**

Action: view mode protects action fields, crew assignments, and creation until editing is enabled

Expected: View mode prevents field/crew/create controls from writing; enabling Edit exposes the appropriate action controls.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:33](../../../src/tests/playwright/behavior/actions.spec.ts#L33) — view mode protects action fields, crew assignments, and creation until editing is enabled (chromium).

## ACTION-002: action name and duration validation and Cancel preserve the saved action and totals

**P1 · Mapped**

Action: action name and duration validation and Cancel preserve the saved action and totals

Expected: Blank action name and duration cannot save; Cancel leaves the persisted action and totals intact; a valid name persists.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:59](../../../src/tests/playwright/behavior/actions.spec.ts#L59) — action name and duration validation and Cancel preserve the saved action and totals (chromium).

## ACTION-003: duration and crew edits recalculate totals, and deactivation excludes the action without deleting it

**P1 · Mapped**

Action: duration and crew edits recalculate totals, and deactivation excludes the action without deleting it

Expected: Duration and crew changes produce independently asserted EV1/EV2 totals; deactivation excludes the action without deleting its identity/order, and reactivation restores totals.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:91](../../../src/tests/playwright/behavior/actions.spec.ts#L91) — duration and crew edits recalculate totals, and deactivation excludes the action without deleting it (chromium).

## ACTION-004: duplicated actions own independent values and deletion honors Cancel and removes only the copy

**P1 · Mapped**

Action: duplicated actions own independent values and deletion honors Cancel and removes only the copy

Expected: Duplicate has independent identity and copied fields; Cancel retains it and confirmed Delete removes only the copy and its order entry after reload.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:134](../../../src/tests/playwright/behavior/actions.spec.ts#L134) — duplicated actions own independent values and deletion honors Cancel and removes only the copy (chromium).

## ACTION-005: a new action belongs to the selected station and its name and crew survive reload

**P1 · Mapped**

Action: a new action belongs to the selected station and its name and crew survive reload

Expected: A created action belongs only to the selected station, retains its name and EV2 crew assignment after reload and leaves the original station/action unchanged.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:193](../../../src/tests/playwright/behavior/actions.spec.ts#L193) — a new action belongs to the selected station and its name and crew survive reload (chromium).

## ACTION-006: Action parent matrix

**P0 · Gap**

Action: Create, edit, duplicate and delete actions under a POI, station and traverse.

Expected: Each action belongs to the intended parent and order list; permissions, available fields and cleanup match the parent type.

## ACTION-007: Action reorder and stable order

**P1 · Gap**

Action: Drag actions within a parent; cancel unsupported moves; reload and inspect a peer.

Expected: Order is identical in UI and document, with no duplicates or missing actions and no accidental cross-parent ownership change.

## ACTION-008: Adopt POI action into station

**P0 · Gap**

Action: Link a POI, copy one source action into its station, then edit source and copy independently.

Expected: New UUID/lineage, source reference and copy metadata are correct; linking alone does not copy actions and later edits remain independent.

## ACTION-009: Action v1 and v2 field matrix

**P0 · Gap**

Action: Edit v1 title/type/priority/STM and v2 verb/noun/adjective/STM toggle/mission priority; reload.

Expected: Only version-appropriate fields appear and generated wording, saved values and report consumers agree.

## ACTION-010: Action description task text and icon

**P1 · Gap**

Action: Edit rich/free text fields and icon; cancel another edit; reload and inspect aggregate cards.

Expected: Exact supported content persists, task text stays parent-appropriate, and cancellation leaves saved fields unchanged.

## ACTION-011: Action duration mass and numeric boundaries

**P0 · Gap**

Action: Try zero, unset, fractional, negative, maximum and overlong duration/planned-mass values.

Expected: Field constraints and calculated totals agree; absent and zero remain distinct where the domain requires it.

## ACTION-012: Equipment and geographic assignments

**P1 · Gap**

Action: Toggle multiple equipment/geographic items; update reference definitions; reload.

Expected: Assignments survive and parent/EVA consumable and geographic reports recompute without unrelated changes.

## ACTION-013: Action location lifecycle

**P1 · Gap**

Action: Create/move/cancel/clear location and use Set to Station or POI.

Expected: Location, elevation, grid and relative-distance displays match the committed point and preserve parent identity.

## ACTION-014: Save as template permission and fidelity

**P1 · Gap**

Action: Save a fully populated action as a template as allowed and disallowed users; apply it again.

Expected: Supported fields survive the round trip, role restrictions hold, and crew/reference semantics are explicit.

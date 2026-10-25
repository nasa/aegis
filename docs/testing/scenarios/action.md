# Action editing, reuse and ownership

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning mission with a station action, empty second station, linked POI and both action-system versions.

Source: [src/components/panes/actions-action-menu.tsx](../../../src/components/panes/actions-action-menu.tsx), [src/operations/apply/apply-action.ts](../../../src/operations/apply/apply-action.ts).

Scenario mapping: **14/14 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/operations/apply/apply-action.test.ts](../../../src/tests/vitest/operations/apply/apply-action.test.ts), [src/tests/vitest/store/thunks/action_thunk.test.ts](../../../src/tests/vitest/store/thunks/action_thunk.test.ts).

## ACTION-001: view mode protects action fields, crew assignments, and creation until editing is enabled

**P1 · Mapped**

Action: view mode protects action fields, crew assignments, and creation until editing is enabled

Expected: View mode prevents field/crew/create controls from writing; enabling Edit exposes the appropriate action controls.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:33](../../../src/tests/playwright/behavior/actions.spec.ts#L33) — view mode protects action fields, crew assignments, and creation until editing is enabled (chromium, firefox, webkit).

## ACTION-002: action name and duration validation and Cancel preserve the saved action and totals

**P1 · Mapped**

Action: action name and duration validation and Cancel preserve the saved action and totals

Expected: Blank action name and duration cannot save; Cancel leaves the persisted action and totals intact; a valid name persists.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:59](../../../src/tests/playwright/behavior/actions.spec.ts#L59) — action name and duration validation and Cancel preserve the saved action and totals (chromium, firefox, webkit).

## ACTION-003: duration and crew edits recalculate totals, and deactivation excludes the action without deleting it

**P1 · Mapped**

Action: duration and crew edits recalculate totals, and deactivation excludes the action without deleting it

Expected: Duration and crew changes produce independently asserted EV1/EV2 totals; deactivation excludes the action without deleting its identity/order, and reactivation restores totals.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:91](../../../src/tests/playwright/behavior/actions.spec.ts#L91) — duration and crew edits recalculate totals, and deactivation excludes the action without deleting it (chromium, firefox, webkit).

## ACTION-004: duplicated actions own independent values and deletion honors Cancel and removes only the copy

**P1 · Mapped**

Action: duplicated actions own independent values and deletion honors Cancel and removes only the copy

Expected: Duplicate has independent identity and copied fields; Cancel retains it and confirmed Delete removes only the copy and its order entry after reload.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:134](../../../src/tests/playwright/behavior/actions.spec.ts#L134) — duplicated actions own independent values and deletion honors Cancel and removes only the copy (chromium, firefox, webkit).

## ACTION-005: a new action belongs to the selected station and its name and crew survive reload

**P1 · Mapped**

Action: a new action belongs to the selected station and its name and crew survive reload

Expected: A created action belongs only to the selected station, retains its name and EV2 crew assignment after reload and leaves the original station/action unchanged.

Playwright: [src/tests/playwright/behavior/actions.spec.ts:193](../../../src/tests/playwright/behavior/actions.spec.ts#L193) — a new action belongs to the selected station and its name and crew survive reload (chromium, firefox, webkit).

## ACTION-006: Action parent matrix

**P0 · Mapped**

Action: Create, edit, duplicate and delete actions under a POI, station and traverse.

Expected: Each action belongs to the intended parent and order list; permissions, available fields and cleanup match the parent type.

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:117](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L117) — poi action creation, editing, duplication and deletion preserve exact parent ownership (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:117](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L117) — station action creation, editing, duplication and deletion preserve exact parent ownership (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:117](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L117) — traverse action creation, editing, duplication and deletion preserve exact parent ownership (chromium).

## ACTION-007: Action reorder and stable order

**P1 · Mapped**

Action: Drag actions within a parent; cancel unsupported moves; reload and inspect a peer.

Expected: Order is identical in UI and document, with no duplicates or missing actions and no accidental cross-parent ownership change.

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:52](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L52) — poi action drag order reaches a peer and reload with stable unique ownership (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:52](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L52) — station action drag order reaches a peer and reload with stable unique ownership (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:52](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L52) — traverse action drag order reaches a peer and reload with stable unique ownership (chromium).

## ACTION-008: Adopt POI action into station

**P0 · Mapped**

Action: Link a POI, copy one source action into its station, then edit source and copy independently.

Expected: New UUID/lineage, source reference and copy metadata are correct; linking alone does not copy actions and later edits remain independent.

Playwright: [src/tests/playwright/behavior/actionAdoption.spec.ts:59](../../../src/tests/playwright/behavior/actionAdoption.spec.ts#L59) — copying a linked POI action creates an independent station action with source lineage (chromium).

Evidence boundary: UI linking alone creates no station action. Explicit adoption creates independent UUID/refUuid and source lineage, copies all supported payload fields and remains independent through edits to both source and copy, peer display and reload.

## ACTION-009: Action v1 and v2 field matrix

**P0 · Mapped**

Action: Edit v1 title/type/priority/STM and v2 verb/noun/adjective/STM toggle/mission priority; reload.

Expected: Only version-appropriate fields appear and generated wording, saved values and report consumers agree.

Playwright: [src/tests/playwright/behavior/actionVersionFieldsCoverage.spec.ts:21](../../../src/tests/playwright/behavior/actionVersionFieldsCoverage.spec.ts#L21) — legacy action type, title, task priority and all STM priority choices persist without v2 fields (chromium).

Playwright: [src/tests/playwright/behavior/actionVersionFieldsCoverage.spec.ts:100](../../../src/tests/playwright/behavior/actionVersionFieldsCoverage.spec.ts#L100) — v2 action verb noun adjective and mission priority survive STM toggles and refresh aggregate wording (chromium).

## ACTION-010: Action description task text and icon

**P1 · Mapped**

Action: Edit rich/free text fields and icon; cancel another edit; reload and inspect aggregate cards.

Expected: Exact supported content persists, task text stays parent-appropriate, and cancellation leaves saved fields unchanged.

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:211](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L211) — poi action text and icon save, Cancel preserves exact content, and aggregate cards retain supported fields (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:211](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L211) — station action text and icon save, Cancel preserves exact content, and aggregate cards retain supported fields (chromium).

Playwright: [src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts:211](../../../src/tests/playwright/behavior/actionParentMatrixCoverage.spec.ts#L211) — traverse action text and icon save, Cancel preserves exact content, and aggregate cards retain supported fields (chromium).

## ACTION-011: Action duration mass and numeric boundaries

**P0 · Mapped**

Action: Try zero, unset, fractional, negative, maximum and overlong duration/planned-mass values.

Expected: Field constraints and calculated totals agree; absent and zero remain distinct where the domain requires it.

Playwright: [src/tests/playwright/behavior/actionAdoption.spec.ts:212](../../../src/tests/playwright/behavior/actionAdoption.spec.ts#L212) — duration and planned mass boundaries preserve unset versus zero and match parent totals (chromium).

Evidence boundary: Duration is required; mass can be null or zero. Decimal punctuation is filtered to integer digits, four-character limits reject overlong saves, and signed/zero values are accepted. Independently known parent totals and reload match the actual saved values.

## ACTION-012: Equipment and geographic assignments

**P1 · Mapped**

Action: Toggle multiple equipment/geographic items; update reference definitions; reload.

Expected: Assignments survive and parent/EVA consumable and geographic reports recompute without unrelated changes.

Playwright: [src/tests/playwright/behavior/actionAssignmentsCoverage.spec.ts:17](../../../src/tests/playwright/behavior/actionAssignmentsCoverage.spec.ts#L17) — multiple equipment and geographic assignments toggle independently and renamed references refresh totals and exported geography (chromium).

Evidence boundary: The supported geographic reporting consumer is downloaded JSON geographicalUnitsReadable; there is no separate parent/EVA geographic aggregate UI. The test checks displayed assignment names and downloaded geographic names after reference rename/reload, alongside independent parent/EVA consumable totals.

## ACTION-013: Action location lifecycle

**P1 · Mapped**

Action: Create/move/cancel/clear location and use Set to Station or POI.

Expected: Location, elevation, grid and relative-distance displays match the committed point and preserve parent identity.

Playwright: [src/tests/playwright/behavior/entityLocations.spec.ts:366](../../../src/tests/playwright/behavior/entityLocations.spec.ts#L366) — action location create, move, cancel, clear, and Set to Station keep parent identity and reload (chromium).

Playwright: [src/tests/playwright/behavior/entityLocations.spec.ts:505](../../../src/tests/playwright/behavior/entityLocations.spec.ts#L505) — a POI action uses Set to POI without changing its POI parent (chromium).

Evidence boundary: Uses the same test-owned golden DEM and mission-scoped named grid fixture, with cleanup after each test. Independently samples elevations through the terrain API, exercises action map create/move/cancel/clear and Set to Station/POI from their actual parent lists, checks committed coordinates/elevation, preserved parent identity, rendered markers, relative elevation/distance/grid values against the seeded parent, and reload persistence.

## ACTION-014: Save as template permission and fidelity

**P1 · Mapped**

Action: Save a fully populated action as a template as allowed and disallowed users; apply it again.

Expected: Supported fields survive the round trip, role restrictions hold, and crew/reference semantics are explicit.

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v1 fully populated poi action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v1 fully populated station action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v1 fully populated traverse action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v2 fully populated poi action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v2 fully populated station action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v2 fully populated traverse action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:171](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L171) — viewer template creation observes the real account permission while action reads remain available (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:171](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L171) — editor template creation observes the real account permission while action reads remain available (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:171](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L171) — admin template creation observes the real account permission while action reads remain available (chromium).

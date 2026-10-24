# POI lifecycle and association

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning mission with a located POI, source actions and stations referencing it.

Source: [src/components/panes/poi/poi-right.tsx](../../../src/components/panes/poi/poi-right.tsx), [src/operations/apply/apply-poi.ts](../../../src/operations/apply/apply-poi.ts).

Scenario mapping: **5/8 (62.5%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/poi_thunk.test.ts](../../../src/tests/vitest/store/thunks/poi_thunk.test.ts).

## POI-001: POI edits save and cancel independently, and duplicates preserve location without sharing identity

**P1 · Mapped**

Action: POI edits save and cancel independently, and duplicates preserve location without sharing identity

Expected: Cancel preserves the source name; rename persists; a duplicate has a fresh UUID and the same location; changing the copy leaves the source independent after reload.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:244](../../../src/tests/playwright/behavior/planning.spec.ts#L244) — POI edits save and cancel independently, and duplicates preserve location without sharing identity (chromium).

## POI-002: deleting a referenced POI clears associated actions and station references while preserving the plan

**P1 · Mapped**

Action: deleting a referenced POI clears associated actions and station references while preserving the plan

Expected: Deleting the POI removes its associated actions, station links and action-order references while preserving seeded EVA/traverse data after reload.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:278](../../../src/tests/playwright/behavior/planning.spec.ts#L278) — deleting a referenced POI clears associated actions and station references while preserving the plan (chromium).

## POI-003: Create POI and validate identity

**P1 · Mapped**

Action: Create a POI through the UI; try blank, duplicate and overlong names; save a valid unique name.

Expected: New POI has the expected defaults and unique identity; validation blocks invalid writes and reload retains it.

Playwright: [src/tests/playwright/behavior/poiLifecycle.spec.ts:14](../../../src/tests/playwright/behavior/poiLifecycle.spec.ts#L14) — a new POI has independent default state and rejects blank, duplicate and overlong names (chromium).

## POI-004: POI deletion Cancel and adopted copies

**P0 · Mapped**

Action: Copy a POI action into a station; cancel then confirm deleting the POI.

Expected: Cancel preserves everything; confirmed cleanup follows the current adopted-copy ownership contract and preserves unrelated station actions.

Playwright: [src/tests/playwright/behavior/poiLifecycle.spec.ts:63](../../../src/tests/playwright/behavior/poiLifecycle.spec.ts#L63) — canceling referenced POI deletion preserves adopted copies and confirming removes only POI-owned actions (chromium).

## POI-005: POI location lifecycle

**P1 · Gap**

Action: Create/move/cancel/clear POI coordinates by map and supported fields; reload.

Expected: Committed coordinates and elevation match the intended point; Cancel preserves the original; relative elevation and grid display recompute.

## POI-006: POI metadata and icon

**P2 · Gap**

Action: Change description and each supported icon shape; cancel and reload.

Expected: List, detail and map agree with persisted metadata and icon without mutating associations.

## POI-007: POI station links and navigation

**P1 · Mapped**

Action: Link/unlink one POI from multiple stations and follow backlinks.

Expected: Association lists and counters agree without implicitly adopting actions; changes persist to peers.

Playwright: [src/tests/playwright/behavior/poiLinks.spec.ts:28](../../../src/tests/playwright/behavior/poiLinks.spec.ts#L28) — linking a POI across stations updates peers and counters without adopting source actions (chromium).

## POI-008: POI report severity and mass

**P1 · Gap**

Action: Use missing, disabled and fully specified actions with known masses and science coverage.

Expected: POI totals, warnings and report state use the correct enabled actions and known quantities.

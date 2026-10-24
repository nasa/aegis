# Execution position entry, types and sources

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Running/stopped REX with multiple timestamped positions, types and sources and known station/traverse coordinates.

Source: [src/components/interface/map/overlays/map-menu-pos.tsx](../../../src/components/interface/map/overlays/map-menu-pos.tsx), [src/components/interface/map/overlays/map-menu-pos-menu.tsx](../../../src/components/interface/map/overlays/map-menu-pos-menu.tsx), [src/components/interface/map/behaviors/PosEntries.tsx](../../../src/components/interface/map/behaviors/PosEntries.tsx), [src/store/thunk/thunkRexPosEntry.ts](../../../src/store/thunk/thunkRexPosEntry.ts), [src/store/thunk/thunkRexPosSource.ts](../../../src/store/thunk/thunkRexPosSource.ts).

Scenario mapping: **6/7 (85.7%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/rexPosEntry_thunk.test.ts](../../../src/tests/vitest/store/thunks/rexPosEntry_thunk.test.ts), [src/tests/vitest/store/thunks/rexPosSource_thunk.test.ts](../../../src/tests/vitest/store/thunks/rexPosSource_thunk.test.ts).

## POSITION-001: New position PET capture and placement

**P0 · Mapped**

Fixture: Isolated execution mission with EV1/EV2 and Crew/Rover, fixed browser Date with native timers, paused and ticking PET variants; all position sources visible.

Action: Start New Pos, advance PET, change types/source, place the point and reload.

Expected: Position uses the intended captured PET, selected metadata and committed coordinates rather than placement-time drift.

Playwright: [src/tests/playwright/behavior/positions.spec.ts:245](../../../src/tests/playwright/behavior/positions.spec.ts#L245) — New Pos captures ticking PET before placement and saves the selected types and source (chromium).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:245](../../../src/tests/playwright/behavior/positions.spec.ts#L245) — New Pos captures paused PET before placement and saves the selected types and source (chromium).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:307](../../../src/tests/playwright/behavior/positions.spec.ts#L307) — Cancel Pos abandons a new entry and removes the pending map placement (chromium).

## POSITION-002: Position edit Save versus map placement

**P0 · Mapped**

Fixture: Active paused execution with EV1/EV2 and Crew/Rover, fixed browser Date, peer page and known saved position.

Action: Draft type/source changes while moving an existing position; compare map finish, full Save and Cancel.

Expected: Coordinate/time updates and drafted metadata follow their distinct commit boundaries; Cancel preserves the previous entry.

Playwright: [src/tests/playwright/behavior/positions.spec.ts:335](../../../src/tests/playwright/behavior/positions.spec.ts#L335) — moving an existing position commits coordinates only while Save and Cancel control metadata drafts (chromium).

Evidence boundary: Map finish updates location/updatedAt while retaining captured PET and saved metadata; full Save commits drafted metadata. Cancel Edit and Cancel Pos preserve the last committed entry.

## POSITION-003: Position list edit duplicate delete

**P1 · Mapped**

Action: Edit supported position fields, cancel/confirm deletion and inspect map/history.

Expected: Exact persisted entries, map markers and path connections agree without changing other source/type histories.

Playwright: [src/tests/playwright/behavior/positions.spec.ts:335](../../../src/tests/playwright/behavior/positions.spec.ts#L335) — moving an existing position commits coordinates only while Save and Cancel control metadata drafts (chromium).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:419](../../../src/tests/playwright/behavior/positions.spec.ts#L419) — position deletion honors Cancel and removes only its entry, marker and obsolete path after confirmation (chromium).

Evidence boundary: The current list supports Edit and Delete Entry; no duplicate control exists. Tests cover those supported actions, exact history, marker/path removal and preservation of unrelated source/type entries.

## POSITION-004: Position type CRUD order and usage

**P1 · Mapped**

Action: Create/reorder/rename/style/delete marker types, including types used by entries.

Expected: Abbreviation/icon/path color persist; usage guards prevent invalid deletion and maps update without stale labels.

Playwright: [src/tests/playwright/behavior/positionTypes.spec.ts:146](../../../src/tests/playwright/behavior/positionTypes.spec.ts#L146) — position types create, rename, reorder, style, guard used deletion and update map labels and paths (chromium).

Evidence boundary: UI create/name/abbreviation/icon/path-color/reorder, used-deletion guards and unused deletion, a newly typed entry, map labels/path styling and reload are checked with unchanged planning data.

## POSITION-005: Position source CRUD and limits

**P1 · Mapped**

Action: Create/rename/delete sources up to the limit, including used and last remaining source.

Expected: Limit/usage/last-source guards hold and new entries use the correct surviving source after reload.

Playwright: [src/tests/playwright/behavior/positions.spec.ts:852](../../../src/tests/playwright/behavior/positions.spec.ts#L852) — position sources enforce the count and usage guards and persist renames and surviving-source entries (chromium).

Evidence boundary: UI creation up to four sources and over-limit rejection, name/abbreviation editing, used-source and final-source deletion guards, deletion of unused sources and new surviving-source positions are checked against persisted state and reload.

## POSITION-006: Position filtering and paths

**P0 · Partial**

Action: Toggle sources/types with older/newer and same-PET entries on planned, historical and active views.

Expected: Visible points/paths use the intended scope, ordering and filters; historical ages stay tied to their own REX.

Playwright: [src/tests/playwright/behavior/positions.spec.ts:492](../../../src/tests/playwright/behavior/positions.spec.ts#L492) — source filters and equal-PET chronology stay scoped to active, historical and planned views (chromium).

Playwright: [src/tests/playwright/behavior/positionHistoryFilterCoverage.spec.ts:84](../../../src/tests/playwright/behavior/positionHistoryFilterCoverage.spec.ts#L84) — historical source filters use that REX's own PET and do not leak into active or planned scope (chromium).

Evidence boundary: Active source filters/equal-PET ordering plus historical All/Crew/Rover marker paths and own-REX ages, active-source isolation and planned clearing are covered. The complete marker-type/source/path/age matrix across all scopes remains unproved.

## POSITION-007: Concurrent position edits and deletions

**P0 · Mapped**

Action: Two clients add entries then edit/delete overlapping positions while one briefly disconnects.

Expected: Both clients converge to the same valid entries without lost unrelated positions or dangling type/source references.

Playwright: [src/tests/playwright/behavior/positions.spec.ts:637](../../../src/tests/playwright/behavior/positions.spec.ts#L637) — two clients converge on position additions, edits and deletions across a disconnect (chromium).

Evidence boundary: Two clients create entries, an offline peer catches up with online edits/deletion, and concurrent saves to the same surviving entry converge to one valid submitted payload without assuming field-level merging or an arbitrary winner. Unrelated entries and type/source references survive; peer deletion, both UIs, markers and reload agree.

# Execution position entry, types and sources

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Running/stopped REX with multiple timestamped positions, types and sources and known station/traverse coordinates.

Source: [src/store/thunk/thunkRexPosEntry.ts](../../../src/store/thunk/thunkRexPosEntry.ts), [src/store/thunk/thunkRexPosSource.ts](../../../src/store/thunk/thunkRexPosSource.ts).

Scenario mapping: **0/7 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/rexPosEntry_thunk.test.ts](../../../src/tests/vitest/store/thunks/rexPosEntry_thunk.test.ts), [src/tests/vitest/store/thunks/rexPosSource_thunk.test.ts](../../../src/tests/vitest/store/thunks/rexPosSource_thunk.test.ts).

## POSITION-001: New position PET capture and placement

**P0 · Gap**

Action: Start New Pos, advance PET, change types/source, place the point and reload.

Expected: Position uses the intended captured PET, selected metadata and committed coordinates rather than placement-time drift.

## POSITION-002: Position edit Save versus map placement

**P0 · Gap**

Action: Draft type/source changes while moving an existing position; compare map finish, full Save and Cancel.

Expected: Coordinate/time updates and drafted metadata follow their distinct commit boundaries; Cancel preserves the previous entry.

## POSITION-003: Position list edit duplicate delete

**P1 · Gap**

Action: Edit supported position fields, cancel/confirm deletion and inspect map/history.

Expected: Exact persisted entries, map markers and path connections agree without changing other source/type histories.

## POSITION-004: Position type CRUD order and usage

**P1 · Gap**

Action: Create/reorder/rename/style/delete marker types, including types used by entries.

Expected: Abbreviation/icon/path color persist; usage guards prevent invalid deletion and maps update without stale labels.

## POSITION-005: Position source CRUD and limits

**P1 · Gap**

Action: Create/rename/delete sources up to the limit, including used and last remaining source.

Expected: Limit/usage/last-source guards hold and new entries use the correct surviving source after reload.

## POSITION-006: Position filtering and paths

**P0 · Gap**

Action: Toggle sources/types with older/newer and same-PET entries on planned, historical and active views.

Expected: Visible points/paths use the intended scope, ordering and filters; historical ages stay tied to their own REX.

## POSITION-007: Concurrent position edits and deletions

**P0 · Gap**

Action: Two clients add entries then edit/delete overlapping positions while one briefly disconnects.

Expected: Both clients converge to the same valid entries without lost unrelated positions or dangling type/source references.

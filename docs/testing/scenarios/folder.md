# Folders, ordering and shared lists

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning entities and presets assigned to multiple folders, including an empty folder.

Source: [src/operations/apply/apply-mission-folder.ts](../../../src/operations/apply/apply-mission-folder.ts), [src/store/thunk/thunkFolder.ts](../../../src/store/thunk/thunkFolder.ts).

Scenario mapping: **0/4 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/folder_thunk.test.ts](../../../src/tests/vitest/store/thunks/folder_thunk.test.ts), [src/tests/vitest/operations/apply/apply-mission-folder.test.ts](../../../src/tests/vitest/operations/apply/apply-mission-folder.test.ts).

## FOLDER-001: Folder create rename delete

**P1 · Gap**

Action: Create and rename folders for POIs, stations, EVAs and presets; delete empty and populated folders; reload.

Expected: Each list retains its entities and correct folder membership; canceled confirmation and invalid names preserve saved state.

## FOLDER-002: Move and reorder folder content

**P1 · Gap**

Action: Drag entities into/out of folders, reorder supported rows and move between folders.

Expected: Each UUID occurs in the intended place once, with the documented ordering after reload and on a peer.

## FOLDER-003: Folder visibility exceptions

**P1 · Gap**

Action: Hide a folder then select a contained station/POI or an EVA using hidden stations.

Expected: Folder visibility, selected-object exceptions and EVA scope remain distinct and produce the intended map features.

## FOLDER-004: Concurrent folder membership edits

**P1 · Gap**

Action: Two clients move/delete the same entity or folder at once.

Expected: Clients converge without duplicate membership, orphan references, or lost unrelated entities.

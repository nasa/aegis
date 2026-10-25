# Folders, ordering and shared lists

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning entities and presets assigned to multiple folders, including an empty folder.

Source: [src/operations/apply/apply-mission-folder.ts](../../../src/operations/apply/apply-mission-folder.ts), [src/store/thunk/thunkFolder.ts](../../../src/store/thunk/thunkFolder.ts).

Scenario mapping: **4/4 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/folder_thunk.test.ts](../../../src/tests/vitest/store/thunks/folder_thunk.test.ts), [src/tests/vitest/operations/apply/apply-mission-folder.test.ts](../../../src/tests/vitest/operations/apply/apply-mission-folder.test.ts).

## FOLDER-001: Folder create rename delete

**P1 · Mapped**

Action: Create and rename folders for POIs, stations, EVAs and presets; delete empty and populated folders; reload.

Expected: Each list retains its entities and correct folder membership; canceled confirmation and invalid names preserve saved state.

Playwright: [src/tests/playwright/behavior/folders.spec.ts:158](../../../src/tests/playwright/behavior/folders.spec.ts#L158) — poi folder creation, rename validation, cancellation and guarded deletion persist (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:158](../../../src/tests/playwright/behavior/folders.spec.ts#L158) — station folder creation, rename validation, cancellation and guarded deletion persist (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:158](../../../src/tests/playwright/behavior/folders.spec.ts#L158) — eva folder creation, rename validation, cancellation and guarded deletion persist (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:158](../../../src/tests/playwright/behavior/folders.spec.ts#L158) — preset folder creation, rename validation, cancellation and guarded deletion persist (chromium).

Evidence boundary: All four planning folder types cover UI creation/rename, invalid-name Save attempts, canceled rename, populated-folder deletion rejection, empty-folder confirmation Cancel/accept and reload with exact entity preservation. Populated folders are protected rather than deleted while retaining members. The known 50 ms inline draft debounce is advanced by the controlled browser clock before valid Save.

## FOLDER-002: Move and reorder folder content

**P1 · Mapped**

Action: Drag entities into/out of folders, reorder supported rows and move between folders.

Expected: Each UUID occurs in the intended place once, with the documented ordering after reload and on a peer.

Playwright: [src/tests/playwright/behavior/folders.spec.ts:315](../../../src/tests/playwright/behavior/folders.spec.ts#L315) — poi items move between folders and root exactly once across peer and reload (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:315](../../../src/tests/playwright/behavior/folders.spec.ts#L315) — station items move between folders and root exactly once across peer and reload (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:315](../../../src/tests/playwright/behavior/folders.spec.ts#L315) — eva items move between folders and root exactly once across peer and reload (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:315](../../../src/tests/playwright/behavior/folders.spec.ts#L315) — preset items move between folders and root exactly once across peer and reload (chromium).

Evidence boundary: Real pointer activation and target-hover assertions precede every drop for all four list types. Direct folder-to-folder and folder-to-root moves, exact membership arrays, UUID uniqueness and intended peer/reload placement are covered. FolderOrganizer exposes only folder/root drop targets; item-row reordering is unsupported and receives no claim.

## FOLDER-003: Folder visibility exceptions

**P1 · Mapped**

Action: Hide a folder then select a contained station/POI or an EVA using hidden stations.

Expected: Folder visibility, selected-object exceptions and EVA scope remain distinct and produce the intended map features.

Playwright: [src/tests/playwright/behavior/folders.spec.ts:23](../../../src/tests/playwright/behavior/folders.spec.ts#L23) — hidden poi folders preserve selection exceptions, shared visibility and saved membership (chromium).

Playwright: [src/tests/playwright/behavior/folders.spec.ts:23](../../../src/tests/playwright/behavior/folders.spec.ts#L23) — hidden station folders preserve selection exceptions, shared visibility and saved membership (chromium).

## FOLDER-004: Concurrent folder membership edits

**P1 · Mapped**

Action: Two clients move/delete the same entity or folder at once.

Expected: Clients converge without duplicate membership, orphan references, or lost unrelated entities.

Playwright: [src/tests/playwright/behavior/folderConcurrency.spec.ts:103](../../../src/tests/playwright/behavior/folderConcurrency.spec.ts#L103) — concurrent moves of one station converge to one folder membership without losing peers (chromium).

Playwright: [src/tests/playwright/behavior/folderConcurrency.spec.ts:211](../../../src/tests/playwright/behavior/folderConcurrency.spec.ts#L211) — a move racing with folder deletion leaves a valid station and no orphan membership (chromium).

Playwright: [src/tests/playwright/behavior/folderConcurrency.spec.ts:323](../../../src/tests/playwright/behavior/folderConcurrency.spec.ts#L323) — a POI deletion racing with a folder move converges without an orphan reference (chromium).

Evidence boundary: Uses two authenticated editor clients and held WebSocket messages to overlap UI operations. Covers competing moves of one station, a station move concurrent with destination-folder deletion, and POI deletion concurrent with folder move. Verifies one membership at most, no dangling references, stable unrelated station/folder membership, and peer convergence. Repair is performed only after a fresh persisted permission check; only POI, station, EVA, and preset membership types are normalized.

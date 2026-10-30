# Asset tracking implementation plan

Status: proposed execution plan. Planning only; no feature code is included in this change.
Prepared October 30, 2026 against the current feature branch and the screenshots supplied with the request.

## Outcome and scope

Users can create and edit point assets during EVA planning and REX execution. Assets are mission
data, not EVA/REX data: an asset saved in EVA1 REX appears in EVA2 planning and REX without
copying. The asset system is section-agnostic: assets render and drafts survive regardless of the
selected left-panel section, EVA, or REX.

An asset has a name (required, not necessarily unique) and an optional emoji (shown as the app's
usual ❔ fallback when none is chosen);
there is no asset type field, selector, or Type column. New asset drafts prefill name and emoji
from the most recently created asset in the mission.

An asset may exist without a location. A new record has none until the user enters grid
coordinates or places it on the map, and it can be saved in that state. Unplaced assets appear in
the list but not on the map.

New assets are always created at the root. Users drag them into folders afterwards; folders
replace the earlier set model and its dropdown. Folders appear first in the asset list, with root
assets below. Show/hide controls apply to folders and individual assets. The Map Item Visibility
menu gains Assets and Asset Labels toggles.

Creation and editing both use the black area above the table: asset fields, Place on Map /
Edit Pos., Cancel Pos., and Save / Cancel, using the current position-system click-to-place,
click-to-relocate, and marker-drag interactions. No action requires right-click. A numeric
uncertainty radius in meters draws a circle around the emoji; zero draws just the emoji.

The Positions/Assets floating widget and its minimized launcher are available in every section
once a mission is loaded, without a selected EVA/REX. Positions shows **"Select a REX to see
positions."** when no REX is selected or the selected REX is missing. Crew positions also become
section-agnostic: they render on the map in every section whenever a REX is selected and
Positions is on in Map Item Visibility (D20).

Out of scope: crew-position redesign, movement history/replay, telemetry, inventory quantities,
attachments, dedicated reports, external integration changes, nested folders, folder
duplication, and circle, polyline, or polygon drawing tools.

## Decisions

All decisions below are confirmed. If one changes during implementation, update the affected
sections and acceptance scenarios with it.

| #   | Topic                | Status    | Decision                                                                                                                                                                                                                                                     |
| --- | -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Delivery             | Confirmed | One merge request containing all the work in this plan.                                                                                                                                                                                                      |
| D2  | Permissions          | Confirmed | Mission edit permission only, matching crew positions; the global Edit toggle is not required. Applies to the whole Assets tab: create, edit, delete, move, folder actions, and show/hide.                                                                   |
| D3  | Folder visibility    | Confirmed | `Folder.visible` is stored in the mission document, so hiding a folder hides its assets on every viewer's maps.                                                                                                                                              |
| D4  | New asset placement  | Confirmed | New assets are created at the root. Moving into or between folders is by drag and drop only; the editor has no folder selector.                                                                                                                              |
| D5  | Map coverage         | Confirmed | Placed assets render on the editor (every section), dashboard, and minimap whenever the Assets toggle is on and the shared item/folder flags allow. Editing happens on the editor map only.                                                                  |
| D6  | Section-agnostic     | Confirmed | The widget, rendering, drafts, selection, and map gestures do not depend on the left-panel section or the selected EVA/REX. The widget and launcher are available in every section.                                                                          |
| D7  | Remembered defaults  | Confirmed | Add Asset prefills name and emoji from the most recently created asset in the mission document (`createdAt`, UUID tie-breaker). No browser storage. With no assets, the name is blank and no emoji is chosen.                                                |
| D8  | Folder actions       | Confirmed | Add, rename, delete, and show/hide. Deletion reuses `opDeleteFolder`: populated folders cannot be deleted; no mandatory folder. No folder duplication.                                                                                                       |
| D9  | Uncertainty ring     | Confirmed | Drawn like the lander/station proximity circles: `createCircleLayer`, rebuilt in full on change as `Circles` does. Missions have at most about 30 assets; optimize only if a performance problem is measured.                                                |
| D10 | Elevation            | Confirmed | Store `elevation` for placed assets, fetched like POI and station elevation.                                                                                                                                                                                 |
| D11 | Naming               | Confirmed | The field is `mission.assets`. Rename mission copy's `copyAssets` option to `copyGISAssets`, along with its helper and log text, so "assets" means only these records.                                                                                       |
| D12 | Map display toggles  | Confirmed | Viewer-local Assets / Asset Labels toggles in `MapMenuProvider` cookie settings. Defaults: both on.                                                                                                                                                          |
| D13 | Sort order           | Confirmed | Folders and assets (within each folder and at root) sort alphabetically by name, case-insensitive with `localeCompare`, UUID tie-breaker for identical names.                                                                                                |
| D14 | Label priority       | Confirmed | `PRIORITY_ASSET = 5`, below crew positions, so asset labels dim under every other marker label.                                                                                                                                                              |
| D15 | Required fields      | Confirmed | Nonblank trimmed name, not required to be unique. Emoji is optional, following stations: `icon: null` is stored and every renderer falls back to `"2754"` (❔), as `StationMarkers` and `EmojiRenderer` callers do. Location, color, and notes are optional. |
| D16 | Item visibility      | Confirmed | New shared `Asset.visible` flag alongside `Folder.visible`, with the same document storage and D2 permission. POIs and stations have no per-item flag today, so the item flag is new.                                                                        |
| D17 | Save model           | Confirmed | Draft until Save, one document change per Save. This differs from crew positions, which save live on each click/drag.                                                                                                                                        |
| D18 | Placing while hidden | Confirmed | Starting Place on Map / Edit Pos. turns on the viewer's Assets and Asset Labels toggles in Map Item Visibility. Shared item/folder flags are never changed implicitly (see the Visibility section for hidden existing assets).                               |
| D19 | Marker click         | Confirmed | Clicking an asset marker on the editor, from any section, restores the widget if minimized, selects its Assets tab, expands the asset's folder, and selects and highlights the asset's row. The section does not change.                                     |
| D20 | Crew positions       | Confirmed | Crew position markers, paths, and labels render in every section whenever a REX is selected and Positions is on in Map Item Visibility. The Positions tab shows the selected REX's positions in every section, or the placeholder when none is selected.     |

## Current implementation and integration points

Paths are relative to the repository root.

| Existing area                                                                                            | Finding and integration                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/interface/map/overlays/map-menu-assets.tsx`                                              | "Coming Soon" placeholder. Replace with toolbar, black editor, and folder-aware table.                                                                                                                                                                                                                                                                                                  |
| `src/components/interface/map/overlays/rex-menu.tsx`, `MapOverlays.tsx`, `map-menu-pos.tsx`              | The widget shows only when `sectionSelected === "evas"` and the selected REX exists; the launcher also requires a selected REX. Remove both the section and REX requirements from widget and launcher (D6); add the Positions placeholder. Keep floating bounds/minimize behavior.                                                                                                      |
| `src/components/interface/map/behaviors/PosEntries.tsx`, `behaviors/MarkerLabels.tsx`                    | Crew positions are gated on `sectionSelected === "evas"` in two places: `shouldShow` in `PosEntries` (markers and paths) and `showPosLabels` in `MarkerLabels`. Remove the section check from both, keeping `mapDisplayPos.show && !!selectedRex` (D20). Switching sections does not clear `selectedRexUuid`, so nothing else is needed.                                                |
| `src/components/interface/folders.tsx`                                                                   | `FolderOrganizer` sorts folders with `localeCompare` (`sensitivity: "base"`, no tie-breaker), lists folders before root items, and handles drag/drop and expansion. Its `DraggableItem` and `folderContents` wrappers are `div`s and cannot wrap table rows. Its edit check is `permissions.edit && isInEditMode`, so asset folder rows need their own permission-only check (D2).      |
| `src/typings/folders.d.ts`, `src/store/storeUtils/folder.ts`                                             | `FolderType` is `"poi" \| "station" \| "eva" \| "preset" \| "layer"`. Add `"asset"`; reuse `Folder` (`items`, `visible`, timestamps) and `generateBlankFolder`.                                                                                                                                                                                                                         |
| `src/operations/op-folder.ts`, `src/server/automerge/checkMissionIntegrity.ts`                           | Both target maps are `Record<FolderType, …>`, so adding `"asset"` requires an entry in each. Also check asset membership and asset fields in the integrity pass.                                                                                                                                                                                                                        |
| `src/operations/apply/apply-mission-folder.ts`                                                           | `applyToggleFolderVisible` accepts only POI/station folders; extend it to assets. `applyMoveItemToFolder` removes the item from every folder before checking the target exists, so a bad target silently moves the item to root. Asset moves must validate the target first.                                                                                                            |
| `src/store/thunk/thunkFolder.ts`, `src/store/interface.ts`                                               | Reuse folder create/rename/open state and the `AEGIS_Folders_Interface` cookie.                                                                                                                                                                                                                                                                                                         |
| `src/store/selectors.ts`, `src/components/panes/poi/poi.tsx`, `src/components/panes/station/station.tsx` | Reuse `selectFoldersByType` and the derived item-to-folder mapping; no second membership field.                                                                                                                                                                                                                                                                                         |
| `src/typings/mission.d.ts`, `src/store/storeUtils/mission.ts`                                            | Add `assets`. `rexes` is a dictionary keyed by uuid.                                                                                                                                                                                                                                                                                                                                    |
| `src/components/interface/map/behaviors/InteractionManager.tsx`                                          | The `createMarker` click, `editMarker` click, and `translateend` handlers each call `saveItemPosition`, which dispatches a document thunk immediately. `editMarker` resolves its target with `findFeatureOnMap` and clears the directive if none is found. The auto-cancel watcher's `selectionKey` covers section, POI, station, sequence item, and measurement; posEntry is excluded. |
| `src/store/thunk/thunkMap.ts`, `src/typings/map/map.d.ts`                                                | `thunkUpdateMapDirective` applies the directive after a non-cancellable 200 ms `setTimeout`. `thunkMarkerOnClick` handles only station and POI; add an asset case that leaves the section unchanged (D19). Add `"asset"` to the marker item types.                                                                                                                                      |
| `src/utils/formatting.ts`                                                                                | `calculatePetValue` reads the current clock, ignores `petRunning`, and treats an unparseable timestamp as epoch 0 (`Date.parse(...) \|\| 0`). `secondsFromhhmmss` handles signed values.                                                                                                                                                                                                |
| `src/components/interface/map/MapMenuProvider.tsx`, `src/components/interface/map/overlays/map-menu.tsx` | Add Assets / Asset Labels via `MapSubmenuMarkers`, setters, and the existing cookie defaults/backfill. The floating widget is not inside this provider, so it needs a small bridge to read and set the editor's Assets / Asset Labels toggles (for D18).                                                                                                                                |
| `src/components/interface/map/MapMenuMinimapBridge.tsx`, `DashboardBoundsProvider.tsx`                   | Mirror dashboard asset visibility into the minimap; honor minimap label policy.                                                                                                                                                                                                                                                                                                         |
| `src/components/interface/map/FeatureSourcesProvider.tsx`, `behaviors/MarkerLabels.tsx`                  | Add an `assetSource` and asset name labels on the shared `labelSource` with `PRIORITY_ASSET = 5` next to the existing `PRIORITY_LANDER`…`PRIORITY_POS` (0–4). The editor self-wraps its own `FeatureSourcesProvider`; the dashboard page shares one between dashboard and minimap.                                                                                                      |
| `src/components/interface/map/behaviors/Circles.tsx`, `utils/layers/circleLayer.ts`                      | Proximity circles call `createCircleLayer(center, radiusMeters, options)`, which builds a projected circle with `fromCircle(new Circle(...))` on its own layer and source, rebuilt in full on change. Asset rings use the same factory and approach (D9).                                                                                                                               |
| `src/store/thunk/thunkPoi.ts`, `src/store/thunk/thunkTerrainProfile.ts`                                  | `thunkDocUpdatePoiLocation` fetches elevation with `thunkFetchPointElevation` (which tracks pending state per uuid) and writes `elevation: number \| null`, null when the fetch fails or the mission has no DEM. Assets follow the same pattern (D10).                                                                                                                                  |
| `src/operations/README.md`, `src/server/automerge/migrations/`                                           | Atomic mutation conventions; add and register a new Automerge migration in `migrations/index.ts`.                                                                                                                                                                                                                                                                                       |
| `src/server/express/routes/missionDup.ts`, `missionDump.ts`, `MissionCopyOptions` in `mission.d.ts`      | Mission copy and the superadmin mission dump both copy the whole document, so assets and asset folders come along without code changes; copied missions keep REX UUIDs, so placement provenance still resolves. There is no mission import. Rename `copyAssets` → `copyGISAssets` and `copyMissionAssets` → `copyMissionGISAssets` (D11).                                               |

## Data and persistence

Add ambient types in `src/typings/asset.d.ts` and a required `Mission.assets: { [uuid: string]: Asset }`.
Asset folders use the existing `Mission.folders` with `type: "asset"`.

| Type                    | Fields and constraints                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Asset`                 | `uuid`, trimmed nonblank `name` (not unique), `icon: string \| null` (emoji code point string in the existing picker format, e.g. `"1F534"`; null renders `"2754"`), optional `color`, `visible`, `location: AEGISPoint \| null`, `elevation: number \| null`, finite nonnegative `uncertaintyMeters`, nullable `notes`, `placement: AssetPlacementContext \| null`, `createdAt`, `updatedAt`. |
| Asset folder            | Existing `Folder` with `type: "asset"`. Each item exists in `mission.assets` and belongs to at most one folder. No `asset.folderUuid`.                                                                                                                                                                                                                                                         |
| `AssetPlacementContext` | `locationSetAt` (UTC epoch ms), nullable `runningRexUuid`, `runningRexName`, `runningEvaUuid`, `runningEvaName`, nullable `petClock: AssetPetClockSnapshot`.                                                                                                                                                                                                                                   |
| `AssetPetClockSnapshot` | Copied `petValueAtStartStop`, `petStartStopTimestamp`, `petRunning`. No stored computed PET.                                                                                                                                                                                                                                                                                                   |

New assets are created with `visible: true` and no folder membership.

### Unplaced assets

`location` is `null` until the user enters valid coordinates or places the asset on the map, and
an asset can be saved in that state. Use `null` for the whole point rather than an `AEGISPoint`
with null `lat`/`lng`, so there is no half-set state. A non-null location has finite `lat` and
`lng`; a valid zero coordinate is not unset.

- `location` and `placement` are both null or both set. Setting a location captures placement
  context; there is no action that clears a location once set.
- Unplaced assets have `elevation: null`.
- Unplaced assets appear in the table with "Not placed" in the coordinates and PET cells. They
  have no map feature, ring, label, hover, or selection highlight.
- Filter out unplaced assets before any map conversion: `toMapCoord` returns `[0, 0]` for null
  coordinates without an error, which would draw the asset at the projection origin.
- Uncertainty can be entered and saved before placement; it draws once the asset is placed.
- Editing an unplaced asset offers **Place on Map**; a placed asset offers **Edit Pos.**

### Elevation

Each accepted location change in the draft dispatches `thunkFetchPointElevation` with the asset
uuid and stores the result in the draft. Failure or a mission without a DEM gives `null`, as for
POIs.

- A later location change supersedes an in-flight fetch: discard a result whose point no longer
  matches the draft's location.
- Save waits for a pending fetch to settle, with the pending state shown, then writes location,
  elevation, and placement context in one change.
- Metadata edits and folder moves do not refetch.
- Elevation is shown read-only in the editor and row details.

### Placement context and PET

Each accepted location change (map click, completed drag, or valid coordinate entry) records,
at one instant from `getAccurateNow()`:

- `locationSetAt`, the wall-clock time;
- the running REX (`isRunning`) and its EVA, found from mission data regardless of the selected
  REX/EVA, with name snapshots;
- a detached copy of that REX's PET clock fields.

Opening the editor is not a placement, and Save keeps the captured context rather than
re-reading the clock or the currently running REX. Moving an asset replaces location and
context together on Save. Editing name, emoji, notes, uncertainty, or color, moving it between
folders, or reformatting coordinates without changing them leaves them unchanged. This is a
single latest placement record, not a movement history; `createdAt`/`updatedAt` remain record
timestamps.

Edge cases:

- **No running REX:** REX/EVA fields and `petClock` are null; `locationSetAt` is kept; PET is
  unavailable.
- **More than one running REX:** report the context as ambiguous and store none. `rexes` is a
  dictionary, and its iteration order is not a meaningful tie-break.
- **Invalid captured clock:** keep the identity, timestamp, and raw clock values; show PET as
  unavailable.
- **REX/EVA later renamed or deleted:** the UUIDs are provenance, not foreign keys. Show the name
  snapshots, marked unavailable when the UUID no longer resolves. No cascade or cleanup write.

Derive PET with a pure helper that never reads the current clock:

```text
petSecondsAt(clock, atMs):
    base = secondsFromhhmmss(clock.petValueAtStartStop)        // invalid → unavailable
    if not clock.petRunning: return base
    anchor = Date.parse(clock.petStartStopTimestamp)           // invalid → unavailable
    return ceil(base + (atMs - anchor) / 1000)
```

Called as `petSecondsAt(placement.petClock, placement.locationSetAt)`. Do not reuse
`calculatePetValue` directly: it reads the current clock, ignores `petRunning`, and turns an
invalid timestamp into epoch 0. `calculatePetValue` can be rewritten to call the new helper with
`getAccurateNow()`. A paused clock does not need a valid anchor timestamp. Signed PET and the
`ceil` rounding match current behavior. Live clock changes after placement, from
`applyRexPetStartStop` or Maestro, do not affect a stored placement.

### Mutations

Add `apply-asset.ts` helpers composed with the folder helpers. Each operation is one Automerge
change:

- create asset at the root;
- edit changed fields only;
- move asset into a folder or back to root (drag and drop): validate that the target folder
  exists and has `type === "asset"` before calling `applyMoveItemToFolder`;
- delete asset plus `applyRemoveItemsFromAllFolders`.

Detach values when copying into or out of Automerge.

Before Save, compare the draft's base values with the current document. Keep the draft and show a
recoverable message when the asset was deleted or changed underneath it; never recreate a deleted
asset. Recheck permission, connection, and mission on Save. Automerge resolves concurrent writes;
client checks are not locks.

### Migration

Add and register a new Automerge migration that adds an empty `assets` dictionary where it is
missing. No default folder or set collection. Also update blank missions, fixtures, seeds, folder
target maps, and integrity checks. Existing migrations stay untouched. This branch has only
planned sets; if sets have since been implemented anywhere, migrate them explicitly rather than
shipping two grouping models. No SQL table, REST CRUD endpoint, or socket protocol change.

## Visibility

One rule governs every map artifact (emoji, ring, hover, selection, preview, hit testing):

```text
assetVisible = asset.location != null
            && mapAssets.show
            && asset.visible
            && (no folder || folder.visible)
labelVisible = assetVisible && mapAssets.showLabels && modeAllowsLabels
```

Implement this once as a pure helper and call it from every asset behavior. The map docs
already list the station visible-set copied across three behaviors as a known hazard. The rule
does not depend on the selected section, EVA, or REX (D6).

- `folder.visible` and `asset.visible` are shared document state (D3, D16). Hiding a folder
  hides every asset in it for all users on every map (editor, dashboard, minimap), and the change
  syncs to connected clients like any other document edit. Only the Assets / Asset Labels toggles
  are per viewer.
- Showing a folder keeps each item's own flag; an item in a hidden folder stays hidden until the
  folder is shown. Root assets have no folder gate. A moved item keeps its flag and takes on the
  new folder's gate.
- Collapsing a folder affects the list only.
- Turning off Assets hides all asset map artifacts without changing any shared flag or
  membership. Turning off Asset Labels hides names only.
- Hidden and unplaced assets stay in the list, with own/inherited hidden status shown.
- Starting Place on Map / Edit Pos. turns on the viewer's Assets and Asset Labels toggles (D18).
  New assets are visible and at the root, so nothing else can block them. For an existing asset
  that is hidden, or in a hidden folder, Edit Pos. is disabled with a tooltip naming the shared
  flag to turn back on; coordinate entry still works. Shared flags never change implicitly.

## Interface

### Folder-aware table

Use one table, one column definition, and one header for folder and root rows. Columns: row
number, PET, emoji, name, coordinates, uncertainty (m), notes, visibility, row actions. No Type
column. A shared `colgroup` (or equivalent fixed layout) keeps every row aligned with the header
through expansion, scrolling, rename, and resize.

- Folders are full-width header rows (`tr` / `td colSpan`) with name, expand/collapse,
  visibility, and menu controls. Expanded children are ordinary rows with the same cells and
  widths as root rows. Indentation lives inside the name cell only. No nested tables, spacer
  columns, or `div` wrappers around `tr`.
- Folders sort alphabetically, then root assets after all folders. Assets inside each folder and
  at root also sort alphabetically by name (D13). Row numbers are display only.
- Reuse folder storage, selectors, move/rename/delete helpers, expansion state, and the `@dnd-kit`
  technique, but render with table rows. Prefer a small shared table adapter; otherwise keep
  asset-specific rows. A drag overlay can render outside the table. Dragging must not resize
  columns or start a map gesture.
- Toolbar: Add Asset, Add Folder. Folder menu: rename, delete, show/hide. Drag and drop is the
  only way to move assets into, between, or out of folders (D4). The set dropdown is removed.
- All mutation controls follow D2: enabled with edit permission, regardless of the Edit toggle.
- Clicking an asset marker follows D19.
- Empty state: **"No assets added yet. Click Add Asset to add one."**
- The toolbar and editor sit above a scrolling table. Review the 384 × 320 default and 325 × 318
  minimum widget sizes; editor fields wrap rather than shrink until unreadable. Keep dockview
  bounds behavior.

### Black editor

The black area above the table is the only editor. **Add Asset** opens it with a new draft; a
row's **Edit** opens it with that asset's values. A heading reads **Add Asset** or **Edit Asset**,
and the edited row is marked in the table.

Fields: name, emoji picker, optional color, coordinates, uncertainty (m), notes, read-only
elevation, and read-only placement context (PET, wall-clock time, REX identity). There is no
folder field (D4). Location controls follow the position toolbar:

- **Place on Map** when the draft has no location;
- **Edit Pos.** once it has one, including a new draft after its first placement;
- **Cancel Pos.** during a map gesture.

Finishing a gesture updates the coordinates and preview and leaves the editor open.

The draft lives in Redux: values, nullable location and placement context, base values for
conflict checks, dirty state, and mission identity. It is never written to the document before
Save.

### Add and edit flow

1. **Add Asset** creates one draft with a new UUID, no location, and the name/emoji of the most
   recently created asset in the mission (D7). It does not start a second draft while one exists.
   Everything except placement can be edited immediately. Later remote creations do not change an
   open draft.
2. **Place on Map** and **Edit Pos.** turn on the Assets and Asset Labels toggles before starting
   the gesture (D18; see Visibility for hidden existing assets). While a gesture is active, show **"Click the map to place the asset, or enter coordinates.
   Save to keep changes."**
3. Map gestures use the existing directives with the asset's UUID: `createMarker` for an unplaced
   draft, `editMarker` once placed. Clicking empty map relocates; dragging the marker moves it.
   Row **Edit** sets the asset selection before starting any gesture, so the selection change
   cannot trip the auto-cancel watcher.
4. Location results go to the draft, not the document (see Map rendering for the handler change).
   Valid coordinate entry updates the same draft. Each accepted location change captures fresh
   placement context and starts an elevation fetch.
5. **Save** requires D15's fields, finite nonnegative uncertainty, and, if a location is set,
   finite coordinates. It writes one change, clears the draft, and keeps the asset selected. A new
   asset is saved at the root. Names need not be unique; no emoji saves `icon: null`.
6. **Cancel** discards the draft and its preview. Nothing needs rolling back. **Cancel Pos.**
   ends the gesture and restores the location and context from before it.
7. **Delete** (row menu, existing deletion convention) clears selection, hover, draft,
   directive, marker, ring, label, and membership.

### Coordinate entry

Support the mission's configured coordinate presentation, including the grid forms in the mockups,
with latitude/longitude when no grid is configured. The position toolbar has no full coordinate
editor, so audit the existing LGRS/server-grid inverse converters first; reuse them, or implement
and test a missing inverse rather than reading grid labels as lat/lng. Show accepted syntax in the
field, reject invalid or out-of-grid input, and keep full stored precision. Clearing the field on
an unplaced draft leaves it unplaced; it does not clear an existing location.

### Map Item Visibility controls

Add **Assets** and **Asset Labels** using `submenuAssets: MapSubmenuMarkers` (`show`,
`showLabels`), provider setters, and the existing cookie defaults/backfill. Both default to on
(D12). Viewers can change these without edit permission. Mirror dashboard Assets visibility into
the minimap through the existing bridge, honoring minimap label policy. The floating widget is
outside `MapMenuProvider`, so it reads and sets the editor's two toggles through a small bridge
to apply D18.

### Interaction lifecycle

- One map directive at a time across assets, positions, stations, POIs, and measurements.
  Starting another tool ends the asset gesture and keeps the draft.
- For asset directives, the auto-cancel watcher keys on the selected asset UUID only: selecting
  another asset ends the gesture, while section, EVA, REX, POI, or station selection changes do
  not (D6). They never touch the draft or its captured context. A later location change captures
  context from whichever REX is then running.
- Switching to another asset with a dirty draft offers Save / Discard / Keep Editing. Keep
  Editing does not retarget the draft.
- Changing mission or unmounting the editor ends the gesture and discards the draft; delayed
  callbacks must not write to the previous mission.
- Minimize/reopen and dockview bounds-driven panel recreation keep the draft. Hiding the widget
  ends the gesture.
- Losing edit permission or connection ends the gesture, keeps the draft for review, and disables
  mutation controls. On reconnect, revalidate against the current document before Save.
- Make the directive's 200 ms delayed start cancellable, or check on fire that the directive is
  still wanted, so a cancelled asset edit cannot start afterward.
- Hiding all Assets, the edited asset, or its folder ends the gesture and removes preview and
  highlight; showing it again does not restart the gesture.
- Remove handlers and interactions on every exit path. While an asset directive is active, block
  unrelated marker selection and dragging. Never rely on right-click or native menus.

## Map rendering and uncertainty

Add two headless behaviors, mounted in every editor section and on the dashboard and minimap:

- `AssetMarkers`, with a shared `assetSource`, cached style builders in `utils/styles/`, a
  `MODE_CONFIGS` entry, and a `Z_INDEX` value;
- `AssetUncertainty`, which draws rings the way `Circles` does (see below).

The draft preview and interactions are editor-only. Assets do not join crew position paths or
time/source filtering.

**Feature identity and the draft preview.** The marker's feature id is the asset UUID. While an
asset is being edited, `AssetMarkers` renders the draft's values (location, emoji, color) under
that same feature id, replacing the saved values rather than adding a second feature. That gives
`editMarker` exactly one target and avoids a duplicate marker. A new draft gets its feature once
it has a location. Because the editor has its own `FeatureSourcesProvider`, the preview never
touches the dashboard/minimap sources.

**Routing location results.** Today the `createMarker` click, `editMarker` click, and
`translateend` handlers each call `saveItemPosition`, which writes to the document straight
away. Add an `"asset"` branch to that path that dispatches a draft-location action instead.
Every handler that produces a location must take that branch, not just the dispatch switch.

**Uncertainty rings match the proximity circles (D9).** `uncertaintyMeters` is a radius, not a
diameter or screen pixels. `AssetUncertainty` follows `Circles`:

- One `createCircleLayer(toMapCoord(asset.location), asset.uncertaintyMeters, options)` per
  visible placed asset with positive uncertainty, at `Z_INDEX.CIRCLES`, so rings sit below every
  marker and do not cover crew markers or their selection.
- No circle label (`label: null`); the asset's name is drawn by the marker label.
- Stroke color from the asset's color, falling back to a default, with the mode's
  `circle.minWidth`.
- Rebuilt in full on change, as `Circles` does. Zero uncertainty draws no ring.

`createCircleLayer` builds each ring on its own layer and source with no feature id, so a ring
can never match the directive UUID in `findFeatureOnMap`. Rings are not interactive. In the
editor, the edited asset's ring uses the draft's location and radius.

Per-map differences live in style functions, never in shared feature geometry or props.
Labels join the shared `labelSource` layout in editor and dashboard with explicit asset identity
and `PRIORITY_ASSET` (D14).

## Implementation order

All of this ships in one merge request (D1). The steps below are the order of work inside it;
check boxes track work still to do.

### 1. Data model

- [ ] Asset, placement, and clock types; `Mission.assets` defaults, fixtures, seeds; new
      registered migration.
- [ ] `"asset"` in `FolderType`, both target maps, the visibility toggle guard, and integrity
      checks, including null-location assets.
- [ ] Validated atomic asset create (at root), edit, delete, and folder moves.
- [ ] Pure `petSecondsAt` and placement-context capture; refactor `calculatePetValue` onto it.
- [ ] Rename `copyAssets` → `copyGISAssets` and `copyMissionAssets` → `copyMissionGISAssets`,
      with comments, log text, and test mocks.
- [ ] Tests: migration rerun, wrong/missing folder targets, concurrent clients, origin REX/EVA
      deletion, paused/negative/invalid clocks, multiple running REXes, and mission copy/dump
      carrying assets, folders, null locations, elevation, and placement context.

Exit: assets persist, placed or unplaced, with the existing folder model and no EVA/REX ownership.

### 2. Editor, map rendering, and display toggles

- [ ] Widget/launcher availability in every section without a REX, and the Positions placeholder.
- [ ] Crew positions on the map in every section: drop the section check in `PosEntries` and
      `MarkerLabels` (D20); test markers, paths, and labels in station/POI sections, with
      Positions off, and with no REX selected.
- [ ] Assets / Asset Labels in provider, cookie, and menu; dashboard-to-minimap bridging; widget
      read/write bridge to the editor's two toggles.
- [ ] Minimal flat asset table, plus the black editor for Add/Edit with every field and D2
      permission gating.
- [ ] Draft state, Place on Map / Edit Pos. / Cancel Pos. with D18 toggle handling, draft routing
      in `InteractionManager`, asset-only auto-cancel key, cancellable delayed directive start.
- [ ] `AssetMarkers`, `AssetUncertainty` (via `createCircleLayer`), styles, z-index, mode
      config, `PRIORITY_ASSET` labels, and the shared visibility helper; mounting in every editor
      section, dashboard, and minimap.
- [ ] Asset case in `thunkMarkerOnClick`: restore widget, select Assets tab, expand folder, select
      and highlight the row, no section change (D19).
- [ ] Elevation fetch on location change, with stale-result handling and Save waiting on a
      pending fetch.
- [ ] Coordinate entry with grid inverse conversion.
- [ ] Name/emoji prefill from the most recently created asset.
- [ ] Tests: save unplaced then place later, click/relocate/drag, coordinate round trips,
      zero/invalid uncertainty, gesture versus editor cancel, running versus selected REX,
      delayed Save, metadata-only edits keep context, elevation success/failure/no-DEM and
      superseded fetches, ring radius and center matching a proximity circle of the same size,
      no `[0, 0]` artifacts for unplaced assets, draft and gesture surviving section/EVA/REX
      changes, placement turning both toggles on, null icon rendering ❔, duplicate names,
      Assets and Asset Labels toggles separately, coexistence with position editing.

Exit: users can create, place, edit, and delete assets during planning and execution, and
toggle assets and labels on the map.

### 3. Folders and aligned table

- [ ] Single-header table with full-width folder rows, aligned child rows, root rows last.
- [ ] Folder sorting, state, and helpers adapted to table rows; drag/drop on valid row markup.
- [ ] Folder actions (add, rename, delete, show/hide), row visibility, selection, hover, empty
      states.
- [ ] Tests: alignment through expand/rename/drag/resize/scroll, new assets at root, drag
      between folders and root, empty folders, collapse independent of the map, hidden
      folder/item restore, moves between gates, shared flags versus local toggles, dockview
      recreation.

Exit: users can organize assets without column drift.

### 4. Verification

- [ ] Acceptance scenarios with two clients, reload, and reconnect.
- [ ] Review widget sizes, column alignment, keyboard/focus, errors, and visibility states.
- [ ] Extend folder apply/thunk tests, `rex-menu.test.ts`, `MapPositionMenu.browser.test.tsx`,
      `InteractionManager.browser.test.tsx`, `MapMenuProvider.browser.test.tsx`,
      `MapMenuMinimapBridge.browser.test.tsx`, and `MarkerLabels.browser.test.tsx`.
- [ ] A focused cross-EVA Playwright workflow covering folders and both toggles.
- [ ] Update `src/components/interface/map/CLAUDE.md` once implementation is final, including the
      Rex Menu creation rule and the `PosEntries` row ("only when section=='evas' & selectedRex").
- [ ] Format and lint changed code and run targeted tests throughout; run `npm run test:all`
      before committing or handing off for review.

## Acceptance scenarios

| Scenario               | Required result                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning/no REX        | Widget and launcher work in every section with no EVA/REX selected; Positions shows its instruction; assets can be created and edited.                                                                                            |
| Crew positions         | Select a REX, then switch to the station or POI section: its crew positions, paths, and labels stay on the map and in the Positions tab. Turning Positions off or clearing the REX hides them in every section.                   |
| Section-agnostic       | Placed assets show on the editor in every section. The widget stays available, and a draft and any active map gesture survive switching section, EVA, or REX.                                                                     |
| Name and emoji         | Two assets can share a name; a blank name blocks Save. Saving with no emoji stores `icon: null`, and the table, editor, and every map show ❔ as for stations.                                                                    |
| Permissions            | With edit permission and the Edit toggle off, a user can create, edit, delete, move, and hide assets and folders. Without edit permission, the tab is read-only.                                                                  |
| Unplaced asset         | Save with name/emoji only: the row shows "Not placed", nothing draws on any map (including the projection origin). Place later: marker and context appear on Save.                                                                |
| Cross-EVA              | Save in EVA1 REX; select EVA2 planning/REX, reload, reconnect: same asset, folder, location, uncertainty, and context.                                                                                                            |
| Name/emoji defaults    | No asset type anywhere. Save "Tools" with an emoji; the next Add Asset, on any client or after reload, prefills both and allows changes. Delete it: the next most recent is used.                                                 |
| New assets at root     | Every new asset is saved at the root, even when a folder row is selected or expanded. Dragging it into a folder afterwards moves it.                                                                                              |
| Folder order           | Create Zebra then Alpha: Alpha first, both before root assets, including after rename/reload. Assets in a folder and at root list alphabetically, not by creation time.                                                           |
| Column alignment       | Header, expanded child rows, and root rows align at every width. Folder rows span all columns; name-cell indentation never shifts other cells.                                                                                    |
| Membership/actions     | Drag between folders/root, never more than one membership. Rename and delete empty folders; populated deletion is blocked. No duplicate action.                                                                                   |
| Folder/item visibility | Hide an item, hide then show its folder: the item stays hidden. Collapse never hides map content. Root and moved items take the right gates.                                                                                      |
| Placing while hidden   | With Assets or Asset Labels off, Place on Map / Edit Pos. turns both on and starts. For a hidden asset or one in a hidden folder, Edit Pos. is disabled and names the flag; coordinate entry still works; no shared flag changes. |
| Assets toggle          | Defaults on. Off removes every asset emoji, ring, label, highlight, hit target, and preview; list and shared flags unchanged; other marker types unaffected.                                                                      |
| Asset Labels toggle    | Defaults on. With Assets on, labels off hides names only; on restores names for visible assets only. Asset labels dim under other marker labels.                                                                                  |
| Two viewers            | Viewer A hides a folder: its assets disappear from viewer B's maps without a reload; same for item flags. Local Assets/Asset Labels toggles do not affect the other viewer.                                                       |
| Black editor           | Add and Edit use the same area with place/edit/cancel/save controls and no folder field. Gestures update coordinates and keep the editor open.                                                                                    |
| Marker click           | From any editor section, clicking an asset marker restores the widget, selects the Assets tab, expands its folder, and selects and highlights its row. The section is unchanged.                                                  |
| Placement/PET          | Context comes from the running REX, not the selected one. No running REX: timestamp only. Delayed Save keeps the capture; relocation recaptures; metadata/folder edits do not.                                                    |
| Historical PET         | Paused and negative PET derive correctly; later clock changes, REX deletion, reload, and delayed rendering do not change it.                                                                                                      |
| Cancel/failure         | Cancel restores saved location and context; failure keeps the draft. No deleted-target recreation or broken membership.                                                                                                           |
| Tool cleanup           | Other tools, hiding (global/folder/item), minimize, selecting another asset, and permission/connection loss leave no stale gesture.                                                                                               |
| Elevation              | Placing or moving an asset stores its DEM elevation; no DEM or a failed fetch stores null. Metadata edits keep the stored value.                                                                                                  |
| Uncertainty/copy       | Ring is centered on the asset and drawn like a proximity circle of the same radius. Delete leaves no ring, label, or membership. Mission copy and dump keep all asset data.                                                       |

## Coordination with the positions redesign

This branch owns assets, folder/table integration, map toggles and rendering, the minimal
widget, launcher, and placeholder changes, and the section-gate removal for crew position
rendering (D20). The concurrent branch owns crew-position editor,
table, and domain changes. The supplied black screenshot sets visual direction; no live Figma
design was inspected. Asset delivery must not depend on the redesign merging first.

Shared touch points: `rex-menu.tsx`, `MapOverlays.tsx`, `map-menu-pos.tsx`,
`InteractionManager.tsx` (especially the `saveItemPosition` path and `selectionKey`),
`thunkMap.ts`, marker typing, folder helpers/components, `PosEntries`, and `MarkerLabels`. Extract shared
presentation only where it helps; keep asset and crew drafts separate.

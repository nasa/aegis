# Asset tracking implementation plan

Status: proposed execution plan. Planning only; no feature code is included in this change.
Prepared October 30, 2026 against the current feature branch and the screenshots supplied with the request.

## Outcome and scope

Users can place and edit point assets during EVA planning and REX execution. Assets persist
as mission data: a marker placed in EVA1 REX appears in EVA2 planning and REX without copying.
Assets have a name and emoji; there is no asset type field, selector, or Type column. New asset
drafts prepopulate name and emoji from the last asset placed.

Assets can be put into folders, replacing sets and their dropdown. Folders appear first in the
asset list, sorted alphabetically, with root assets below. Show/hide controls apply to folders
and individual assets. The Map Item Visibility menu also provides Assets and Asset Labels toggles.

Creation and edits both use the black area above the table. It contains asset fields, Place on
Map / Edit Pos., Cancel Pos., and Save / Cancel, using current position-system click-to-place,
click-to-relocate, and marker-drag interactions. No action requires right-click. A numeric
uncertainty radius in meters draws a circle around the emoji; zero draws just the emoji.
No circle-drawing, polyline, or polygon tools are included.

The Positions/Assets floating widget and minimized launcher remain available in the EVA section
without a selected EVA/REX once a mission is loaded. Positions displays **"Select a REX to see
positions."** for missing/unset REX. Preserve the concurrent crew-position redesign's scope.

Out of scope: crew-position redesign, movement history/replay, telemetry, inventory quantities,
attachments, dedicated reports, external integration changes, and nested folders.

## Proposed defaults to review

These choices fill remaining gaps. The requested folders replace the earlier set model; there
is no mandatory default folder or separate asset-set collection.

| Topic                | Proposed behavior                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                 | Required nonblank name plus emoji, optional color/notes; required name is a proposed validation default. No asset type.                                                                                                                                                                                                                                                          |
| Last placed          | This viewer's last successfully saved new asset placement in this mission supplies name/emoji. Persist the pair across reload and EVA/REX changes in user/mission-scoped browser preferences. Canceled/failed drafts, duplication, remote placements, and edits of existing assets do not change it. First use starts with blank name and the existing default emoji convention. |
| Membership           | Zero or one folder via existing `Folder.items`; root assets are allowed. No duplicate `asset.folderUuid` representation.                                                                                                                                                                                                                                                         |
| Folder actions       | Add, rename, duplicate, and delete empty folders. Move assets into/between folders or to root. Reuse existing empty-folder deletion policy; no last-folder restriction.                                                                                                                                                                                                          |
| Visibility ownership | Proposed default follows existing folder code: shared `Folder.visible` and matching shared `Asset.visible`, requiring edit permission. This replaces the earlier proposed personal folder/item hidden-ID lists.                                                                                                                                                                  |
| Map preferences      | Viewer-local Assets/Asset Labels toggles in existing `MapMenuProvider` cookie settings. Defaults: Assets on, labels off. Viewers can toggle these without mission edit permission.                                                                                                                                                                                               |
| Expansion            | Existing local folder expansion state/cookie; collapse does not hide contents on the map.                                                                                                                                                                                                                                                                                        |
| Save                 | Draft/preview until Save; one document change for asset and membership. Cancel discards draft.                                                                                                                                                                                                                                                                                   |
| PET                  | Placement wall-clock time plus running REX identity and its copied PET clock definition; derive PET from saved values.                                                                                                                                                                                                                                                           |
| Coverage             | Edit on editor map; saved assets on editor/dashboard/minimap. No new follow/fit behavior.                                                                                                                                                                                                                                                                                        |

## Current implementation and integration points

Paths below are relative to the repository root.

| Existing area                                                                                                              | Finding and integration                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/interface/map/overlays/map-menu-assets.tsx`                                                                | Replace placeholder with toolbar, black editor, folder-aware table.                                                                                                                                                                                        |
| `src/components/interface/map/overlays/rex-menu.tsx`, `MapOverlays.tsx`, `map-menu-pos.tsx`                                | Remove widget/launcher REX requirement together; add safe Positions placeholder. Retain floating bounds/minimize behavior.                                                                                                                                 |
| `src/components/interface/folders.tsx`                                                                                     | `FolderOrganizer` already sorts folders with case-insensitive `localeCompare`, puts folders before root items, and supports drag/drop/expansion. Its div-based child wrappers cannot directly wrap table rows; adapt rendering while reusing the behavior. |
| `src/typings/folders.d.ts`, `src/store/storeUtils/folder.ts`                                                               | Add `"asset"` to `FolderType`; reuse existing Folder (`items`, `visible`, timestamps) and factory.                                                                                                                                                         |
| `src/store/selectors.ts`, `src/components/panes/poi/poi.tsx`, `src/components/panes/station/station.tsx`                   | Reuse `selectFoldersByType` and derived item-to-folder mapping, avoiding a second membership representation.                                                                                                                                               |
| `src/operations/apply/apply-mission-folder.ts`                                                                             | Reuse upsert/rename/move/removal/delete helpers; extend the current POI/station visibility guard for assets. Validate destination before membership removal.                                                                                               |
| `src/store/thunk/thunkFolder.ts`, `src/store/interface.ts`                                                                 | Reuse folder create/rename/open state and interface cookie plumbing.                                                                                                                                                                                       |
| `src/operations/op-folder.ts`, `src/server/automerge/checkMissionIntegrity.ts`                                             | Extend FolderType target maps for assets and test membership/deletion handling.                                                                                                                                                                            |
| `src/typings/mission.d.ts`, `src/store/storeUtils/mission.ts`                                                              | Add only `mission.assets`; asset folders use existing `mission.folders`.                                                                                                                                                                                   |
| `src/components/interface/map/behaviors/InteractionManager.tsx`, `src/store/thunk/thunkMap.ts`, `src/typings/map/map.d.ts` | Add asset directive/draft callbacks; preserve one active interaction. Current position callbacks persist immediately.                                                                                                                                      |
| `src/components/interface/map/MapMenuProvider.tsx`, `src/components/interface/map/overlays/map-menu.tsx`                   | Add Assets/Asset Labels using `MapSubmenuMarkers`, setters, cookie defaults/backfill. Floating tab cannot assume it is inside this provider.                                                                                                               |
| `src/components/interface/map/MapMenuMinimapBridge.tsx`, `DashboardBoundsProvider.tsx`                                     | Mirror dashboard asset visibility into minimap; honor minimap label-mode policy.                                                                                                                                                                           |
| `src/components/interface/map/FeatureSourcesProvider.tsx`, `behaviors/MarkerLabels.tsx`                                    | Stable asset sources, name labels, cached styles, shared-label layout/per-map gates.                                                                                                                                                                       |
| `src/operations/README.md`, `src/server/automerge/migrations/`                                                             | Atomic mutation conventions and a new registered migration; preserve historical migration logic.                                                                                                                                                           |
| `src/server/express/routes/missionDup.ts`                                                                                  | Mission cloning carries assets/folders; existing `copyAssets` still means GIS files.                                                                                                                                                                       |

## Data and persistence design

Add ambient asset types in `src/typings/asset.d.ts` and required
`Mission.assets: { [uuid: string]: Asset }`. Use existing `Mission.folders` with `type: "asset"`.

| Entity                  | Fields and constraints                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Asset`                 | `uuid`, trimmed nonblank name, `icon` (emoji in existing picker format), optional color, `visible`, valid `location: AEGISPoint`, finite nonnegative `uncertaintyMeters`, nullable notes, placement context, created/updated timestamps. No asset type. |
| Asset folder            | Existing Folder with `type: "asset"`, name, member UUIDs in `items`, `visible`, timestamps. Each item exists in `mission.assets` and belongs to at most one folder.                                                                                     |
| `AssetPlacementContext` | `locationSetAt` (UTC epoch ms), nullable running REX/EVA UUIDs and name snapshots, nullable `petClock: AssetPetClockSnapshot`.                                                                                                                          |
| `AssetPetClockSnapshot` | Copied `petValueAtStartStop`, `petStartStopTimestamp`, and `petRunning`; no separately persisted calculated PET.                                                                                                                                        |
| Editor draft            | Values plus nullable location before placement, desired folder UUID or null, base values, dirty state, mission identity, and captured placement context. Never saved before Save.                                                                       |
| UI state                | Draft/selection/hover/map gesture plus remembered name/emoji. Existing folder interface state for expansion/rename and existing map menu state for global toggles.                                                                                      |

### Placement time, running REX, and PET clock definition

Always record a wall-clock `locationSetAt` timestamp (UTC epoch milliseconds) when a location
is accepted from map placement, completed drag, or valid coordinate entry. At that same instant,
capture the mission's running REX (`isRunning`), if any, and its PET clock definition. Resolve the running REX
from mission data independently of the selected REX/EVA: users may place assets in a planning
view while a different REX is executing. Opening Add Asset is not the placement event, and a
later Save must not replace the placement timestamp or captured clock with current values,
or substitute the then-running REX.

Store this as an `AssetPlacementContext` alongside the location: `locationSetAt`, nullable
`runningRexUuid`, `runningRexName`, `runningEvaUuid`, `runningEvaName`, and nullable
`petClock: AssetPetClockSnapshot`. Copy the REX's actual fields into the snapshot:

- `petValueAtStartStop`: PET when the clock last started/stopped (the user's "pet when started").
- `petStartStopTimestamp`: wall-clock time of that anchor (the user's "time started").
- `petRunning`: whether the clock was advancing at placement, needed to handle paused clocks.

These values are detached copies stored with the asset's placement, not references to the
current REX clock. PET seconds are derived for display/use and are not a separate persisted
source of truth.

The names are snapshots so recorded context remains readable after renaming or deleting the
REX/EVA. These UUIDs are historical provenance, not ownership or required live foreign keys;
retain them when the origin is deleted. Display the snapshot with a deleted/unavailable indication
when it cannot be resolved. No EVA/REX delete cascade or provenance-clearing write is needed.

Use one accurate wall-clock instant from the existing `getAccurateNow()` convention and one
REX snapshot when capturing context. Derive PET from the saved values with a pure helper
whose inputs are the saved placement timestamp and clock definition:

```text
baseSeconds = secondsFromhhmmss(petClock.petValueAtStartStop)
if petClock.petRunning:
    petSeconds = ceil(baseSeconds + (locationSetAt - parseTime(petClock.petStartStopTimestamp)) / 1000)
else:
    petSeconds = baseSeconds
```

An executing REX (`isRunning`) can have a paused PET (`petRunning === false`); its value stays
at the captured base. Preserve the existing signed-time and rounding conventions. Do not call
a helper that reads the current wall clock when rendering an old placement, and do not read
the REX's latest clock fields to derive historical PET. A paused clock does not need a valid
start timestamp if its held PET value is valid.

If no REX is executing, keep REX/EVA context and `petClock` null while retaining the wall-clock
timestamp; derived PET is unavailable. If captured clock data is invalid, retain the REX identity,
timestamp, and original clock values for inspection, show PET as unavailable, and do not invent
a value. If multiple REXes are marked running, report the ambiguous context instead of choosing
the first array entry.

`src/typings/rex.d.ts` contains these clock fields. `applyRexPetStartStop` in
`src/operations/apply/apply-rex.ts` overwrites the live fields on start/stop, and Maestro can
also update them. Capturing the definition at placement preserves enough information to infer
that placement's PET after later pauses, resets, corrections, or REX deletion. No full clock
history or separately stored calculated PET is required for this placement record.

The placement context follows the asset's current location. Moving an existing asset replaces
location and placement context atomically on Save; editing name/emoji/notes/uncertainty or moving
between folders preserves it. Cancel restores both the saved location and context; Cancel Pos.
restores the pre-gesture draft location and context. This is one latest placement record, not a
movement history. `createdAt` and `updatedAt` remain record lifecycle timestamps and do not stand
in for `locationSetAt`. Display PET as read-only captured context, with wall-clock time and REX
identity in accessible row details/tooltip; a full timestamp/REX column is optional for space.

Implement dedicated asset apply helpers composed with existing folder helpers. Validate folder
type/existence before calling `applyMoveItemToFolder`, which currently removes previous
membership before checking its destination. Invalid destinations must not silently unfile assets.
Use one Automerge change for asset creation plus membership, a move, deletion plus membership
cleanup, or folder duplication. Reuse `applyRemoveItemsFromAllFolders` on deletion. Update only
changed fields, and detach values before copying out of/into Automerge snapshots.

Before Save compare edited fields/membership against base/current state. Keep drafts on
conflicts/deleted targets with a recoverable message. Recheck permissions, connection, mission,
and destination; never recreate deleted targets. Automerge handles simultaneous writes; client
checks are not server locks.

Duplicate Folder copies all members with fresh independent UUIDs and new record timestamps in
one change. Preserve names/emojis, location, uncertainty, notes, color, visibility, and placement
context. Use a unique copy name and expand the new folder in the list. Preserve visibility flags;
do not treat duplication as a new placement for remembered defaults.

Add/register a new Automerge migration initializing missing `assets` dictionaries. No mandatory
folder or separate set collection is needed. Update blank missions, fixtures/seeds, schema,
imports, copy/export, folder target maps, and integrity checks. Preserve old folder types/data
and historical migration logic. This branch has only planned sets; if implementation has since
introduced them, inspect and migrate explicitly rather than shipping competing group models.
No new SQL entity table, REST CRUD endpoint, or socket protocol is needed.

## Interface and editing behavior

### Folder-aware table and aligned columns

Use **one table, one column definition, and one header** for foldered and root assets. Columns:
row number, PET, emoji, name, coordinates, uncertainty (m), notes, visibility, row actions.
There is no Type column. Use one `colgroup` or equivalent shared fixed layout so every item row
aligns with the header during expansion, scrolling, rename, and resize.

Folders render as full-width header rows (`tr`/`td colSpan`) with name, expand/collapse,
visibility, and menu controls. Expanded child assets render as ordinary rows in that same table
with the same cell count and widths as root assets. Any indentation belongs **inside the name
cell only**. Do not indent whole rows, add child-only spacer columns, nest independent tables,
or wrap table rows in div-based folder contents. This directly addresses the alignment problem.

Folder groups appear first, case-insensitively alphabetized using existing `localeCompare`
behavior (UUID tie-breaker), with root assets below all folders. Propose creation time descending
within each folder/root, UUID tie-breaker. Display row numbers are not identity; PETs from
different REXes do not define a useful global sort.

Reuse folder storage, selectors, move/rename/delete helpers, expansion state, and the existing
`@dnd-kit` technique. Adapt rendering to actual table rows/cells. Do not insert the existing
`DraggableItem`/`folderContents` div wrappers into `tbody` or around `tr`. Prefer a small shared
table adapter where practical; otherwise keep asset-specific rows and reuse folder behavior.
A drag overlay can render outside the table with a correctly sized preview. Test that dragging
or a drop does not resize columns or initiate a map gesture.

Toolbar: Add Asset and Add Folder. Folder menu: rename, duplicate, delete, show/hide. Empty-folder
deletion matches existing code; no last-folder restriction. Move via drag/drop into folders or
to root, and via an explicit folder/root selector in the black editor for keyboard access.
The old set dropdown is replaced by folder rows, not merely renamed.

Hidden assets/folders remain in the list with explicit own/inherited hidden status. Collapse
only affects list children, not the map. Clicking a visible marker opens Assets, expands its
folder when needed, and selects its row. Selection/hover highlight only visible map features.
Empty state: **"No assets added yet. Click Add Asset to add one."** Keep toolbar and black editor
above a scrollable table. Review default 384 x 320/minimum 325 x 318 sizing, wrapping editor
fields without shrinking controls until unreadable; preserve dockview bounds behavior.

### Last-placement name and emoji defaults

Add Asset initializes only name/emoji from the remembered pair; no type is collected. Do not
copy location, placement time/clock, uncertainty, notes, folder, or visibility from the old asset.
Fresh placement captures fresh context. Update the pair only after successful new-asset Save,
using the final name/emoji. Canceled/failed saves, duplicates, remote changes, and edits of
existing assets do not change it. Persist detached values in user/mission-scoped browser
preferences so they survive reload/EVA/REX changes and deletion of the original asset, without
leaking between missions. The precise meaning/persistence of "last placed" is a proposed default.

### Black area for creation and editing

The black area above the asset table is the single editor for both operations. **Add Asset**
opens it with a new draft; a row's **Edit** action opens the same area populated with that
asset's values. Give it an explicit **Add Asset** or **Edit Asset** heading/instruction so
the current operation is clear. Keep the table visible below it and indicate the row being edited.

Include name, emoji picker, optional color, folder/root selector, coordinates, uncertainty in meters, notes, and
read-only PET/placement context in this area. Its location controls follow the current position
toolbar: **Place on Map** (the equivalent of **New Pos.**) for an unplaced draft, **Edit Pos.**
for a placed asset, and **Cancel Pos.** during a map gesture. Keep coordinate entry and the
editor's **Save / Cancel** controls in this same area. After initial placement, **Edit Pos.**
is available for the new draft too. Completing placement updates the editor's coordinates and
preview while the editor stays open for remaining changes and Save.

### Add and edit

1. Add Asset creates one local draft with remembered name/emoji and opens the black editor. Do not start
   a second draft. Hidden assets remain editable through their rows without silently changing
   visibility. Before map placement or Edit Pos., enable the local Assets display toggle and explicitly show
   the asset and its folder (if assigned) under the normal edit-permission rules so the preview/target is available; explain which visibility gate is blocking
   the map interaction. Coordinate and metadata editing remain available while hidden.
2. In the black editor, provide **Place on Map** for a draft without a location and **Edit Pos.**
   once it has one, using the current position toolbar's placement/cancellation behavior.
   While map placement is active, show **"Click the map to place the asset, or enter coordinates.
   Save to keep changes."** For an existing asset, prefill its current values in this same editor.
3. Enter map-pick mode through the existing directive mechanism. Add uses `createMarker`;
   Edit Pos. uses `editMarker`. Clicking empty map relocates the point; dragging the selected
   point also updates it. Finishing the gesture exits map-pick mode but leaves the editor open.
4. Route asset position callbacks to the draft, not the crew-position save thunk. Show draft
   icon/uncertainty changes immediately. Avoid rendering both the saved marker and its preview.
   Direct coordinate entry updates the same draft and preview, after successful validation.
   Each accepted location change captures wall-clock time, the running REX identity, and its
   PET clock definition together in the draft. Do not recapture context merely when reformatting coordinates.
5. Save requires a valid folder/root destination, name, emoji, finite location, and finite nonnegative
   uncertainty. Commit all new asset fields or the existing asset's changed fields in one
   Automerge change; then clear the draft and keep the saved asset selected. After a successful new placement,
   remember its final name and emoji for the next draft.
6. Cancel discards the draft, removes the preview, and restores the saved geometry locally.
   No rollback write should be necessary because asset edits were never persisted live.
   **Cancel Pos.** cancels only the current map gesture, restoring its pre-gesture draft location;
   the editor's **Cancel** discards the entire asset edit.
7. Delete is available through the row menu using the app's existing deletion convention.
   Clear the corresponding selection, hover, draft, interaction, marker, and uncertainty ring.

Coordinate entry must support the mission's configured coordinate presentation, including the
grid forms used in the mockups and a latitude/longitude fallback when no grid is configured.
The current position toolbar does not supply the complete coordinate editor shown in the new
design: audit existing LGRS/server-grid inverse conversion utilities before adding a small
asset coordinate field. Reuse proven converters where available; implement/test a missing
inverse conversion rather than interpreting grid labels as longitude/latitude. Document accepted
syntax in the field, reject out-of-grid/invalid input, and preserve full stored precision when
formatting for display. A valid zero coordinate must not be treated as unset.

### Map Item Visibility controls

Add **Assets** and **Asset Labels** controls to the existing map visibility menu using
`submenuAssets: MapSubmenuMarkers` (`show`, `showLabels`), provider setters, and cookie
backfill/defaults. Viewers can use these local preferences without editing mission data.
Turning Assets off hides asset emojis, uncertainty rings, labels, hover/selection, and previews;
it does not alter folder/item flags or membership. Turning labels off hides names only.

```text
assetVisible = mapAssets.show && asset.visible && (folder is absent || folder.visible)
labelVisible = assetVisible && mapAssets.showLabels && modeAllowsLabels
```

Showing a folder preserves individual visibility choices. Showing an item in a hidden folder
leaves it hidden until its folder is shown. Root assets have no folder gate. A move preserves
the item's flag and adopts the destination folder's gate. Collapsing a folder changes the list
only. Shared folder/item visibility uses existing folder edit permissions; global map preferences
are local to each viewer. Do not create redundant personal hidden-folder/item lists.

Asset labels show names and participate in shared marker-label layout in editor/dashboard.
Mirror dashboard Assets visibility into the minimap through the existing bridge/provider
technique, honoring minimap label policy. Per-map toggles must not remove shared source geometry
needed by another map. Dockview editor visibility checks need a small accessible bridge or shared
selector rather than assuming its content is inside `MapMenuProvider`.

### Interaction lifecycle

- Preserve one active map directive across assets, positions, stations, POIs, and measurements.
  Starting another tool cancels the asset's map gesture and retains its editor draft.
- Switching asset/folder/tab with a dirty draft offers Save/Discard/Keep Editing. Keep Editing
  retains the original context; it must not retarget the draft. Switching EVA/REX in the same
  mission preserves the draft and its captured placement context, while ending its map gesture.
  A later intentional location change captures new placement context using the REX then running.
- Leaving the EVA section, changing mission, or unmounting cancels asset interactions and
  discards transient drafts. Do not write to the previous mission from a delayed callback.
  If the existing navigation flow supports dirty-form protection, participate in it.
- Minimize/reopen and dockview bounds-driven panel recreation preserve the draft in Redux.
  End the map gesture when the widget is hidden so an invisible editor cannot keep placing assets.
- On lost edit permission/connection, stop map gestures, retain draft values for review, and
  disable mutation controls. On reconnect, revalidate against the current document before Save.
- Guard delayed directive startup in `thunkUpdateMapDirective`: cancel/unmount/navigation can
  occur during its existing 200 ms delay. A canceled asset edit must not reactivate afterward.
- Hiding all Assets, the edited asset, or its folder ends its map gesture, retains its draft, and removes the
  preview/highlight. Showing it again does not restart the gesture automatically.
- Remove event handlers/interactions on every exit path and suppress unrelated marker selection
  and dragging while an asset directive is active. Never rely on right-click or native menus.

## Map rendering and uncertainty

Add `AssetMarkers` and `AssetUncertainty` headless behaviors, stable sources, and cached style
builders following the existing map architecture. Mount saved-data rendering in editor,
dashboard, and minimap; draft rendering and interactions belong only to the editor.

Use the same effective asset visibility rule below for emojis, circles, hover, selection,
previews, and hit testing; labels also require the Asset Labels toggle and mode support. Hidden folders and individually hidden assets
must leave no visible or interactive ring/highlight. Feature IDs must be stable
and distinct for the asset marker and uncertainty geometry; the edit directive must resolve
the marker Point, never the ring. Circles are noninteractive. Account for shared sources:
per-map styles/visibility must not remove geometry needed by a sibling map, and minimap
reconciliation must not overwrite the editor's preview or the dashboard's data.

Add asset mode configuration and z-index constants so rings sit below icons and do not obscure
crew markers or their selection. Reuse the icon renderer/picker conventions and extend hover,
selection, and required name-label integration with explicit asset identity. Do not add assets
to crew position paths or time/source filtering.

Treat uncertainty as a **ground-distance radius**, not diameter or screen pixels. Generate a
geodesic polygon around the canonical point using the mission's planet radius, then project
its vertices. A projected `Circle` with a numeric meter radius is insufficient where projection
scale differs from ground distance; the current lander/station circle renderer is not proof of
geodesic accuracy. Polygon geometry here is an internal rendering detail, not a drawing feature.
Recompute on location, radius, planet/projection changes; keep stable geometry during unrelated
updates. Test polar/custom lunar and Earth/Mercator cases. Require a valid positive planet radius
for positive uncertainty, with a visible explanation when unavailable. Zero uncertainty remains
usable without a ring. Test pole/seam handling so circles cannot become world-spanning artifacts.

## Ordered implementation work

Check boxes track implementation to perform; no feature code is completed by this plan.

### 1. Persist assets using existing folders

- [ ] Add asset/placement/clock types, `Mission.assets` defaults, fixtures, and a new registered migration.
- [ ] Extend FolderType, target maps, visibility guards, and membership integrity for assets.
- [ ] Add validated atomic asset CRUD, membership moves/root assignment, folder duplication/cleanup.
- [ ] Implement clock capture and pure PET derivation using the saved instant/definition.
- [ ] Verify export/import/mission copy preserves folders/assets, visibility, and placement context.
- [ ] Test migration reruns, wrong/missing folder targets, independent-client changes, conflict
      handling, and origin REX/EVA deletion without losing assets or historical PET context.

Exit: assets persist with one existing folder model, independently of EVA/REX ownership.

### 2. Widget, aligned folder table, and remembered defaults

- [ ] Update widget/launcher availability and Positions placeholder together.
- [ ] Add asset UI/reset plumbing and user/mission-scoped last-placement name/emoji preferences.
- [ ] Implement one table/header/column definition with full-width alphabetical folder rows,
      ordinary aligned child rows, and root assets after folders. Remove Type column/set dropdown.
- [ ] Adapt existing folder sorting/state/helpers and drag/drop to valid table row markup.
- [ ] Add folder actions, editor folder/root selector, row visibility/selection/hover, and empty states.
- [ ] Test header alignment on expand/rename/drag/resize/scroll, root moves, empty folders,
      keyboard assignment, collapse independent of map visibility, and dockview recreation.
- [ ] Test name/emoji prefilling and overrides, canceled/failed saves, duplicate/remote/edit
      exclusions, deletion of original asset, reload, EVA/REX changes, and mission isolation.

Exit: planning users can organize assets and repeat placement without column alignment drift.

### 3. Assets and Asset Labels map controls

- [ ] Add provider/cookie/menu Assets and Asset Labels toggles and dashboard/minimap bridging.
- [ ] Add asset sources, marker/uncertainty behaviors/styles, and required name-label integration.
- [ ] Compose master/folder/item visibility for every artifact/interaction and label toggle for text.
- [ ] Test master-off and labels-off separately, hidden folder/item restoration, root/moves,
      shared folder/item flags versus local map preferences, geodesic radii/projections,
      and shared dashboard/minimap sources.

Exit: users can toggle map assets and labels independently while respecting folder/item gates.

### 4. Black editor and map interaction

- [ ] Route Add Asset and row Edit into the same black area with name/emoji, optional color/notes,
      folder/root, coordinates, uncertainty, and read-only derived PET/context. No asset type.
- [ ] Add Place on Map / Edit Pos., Cancel Pos., Save/Cancel, and asset draft/preview callbacks.
- [ ] Capture placement context on location changes; Save asset/membership atomically and update
      remembered defaults only on successful new placement.
- [ ] Implement conflict, deleted-target, permission/connection, dirty navigation, and delayed-directive guards.
- [ ] Test clicks/relocation/drag, coordinate round trips, zero/invalid uncertainty, gesture/editor
      cancellation, visibility-triggered cleanup, and coexistence with current position editing.
- [ ] Test running versus selected REX, paused/negative/invalid clock, delayed Save, later clock
      corrections/deletion/reload, and unchanged context on metadata/membership-only edits.

Exit: complete authoring works in the black editor during planning and execution.

### 5. Complete verification

- [ ] Run acceptance scenarios with two clients, reload, and reconnect.
- [ ] Review default/minimum widget widths, column alignment, keyboard/focus, errors, and visibility states.
- [ ] Extend folder apply/thunk tests, `rex-menu.test.ts`, `MapPositionMenu.browser.test.tsx`,
      `InteractionManager.browser.test.tsx`, `MapMenuProvider.browser.test.tsx`,
      `MapMenuMinimapBridge.browser.test.tsx`, and `MarkerLabels.browser.test.tsx`.
- [ ] Add meaningful asset geometry/editor/table integration tests and a focused cross-EVA
      Playwright workflow with folders and Assets/Asset Labels controls.
- [ ] Update map architecture documentation once implementation is final.
- [ ] Format/lint changed code and run targeted tests during implementation; run
      `npm run test:all` before committing or handing implementation off for review.

## Acceptance scenarios

| Scenario               | Required result                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Planning/no REX        | Widget/launcher work without selected EVA/REX in the EVA section; Positions shows its instruction; Assets can create/edit.                                                                                         |
| Cross-EVA              | Save in EVA1 REX; select EVA2 planning/REX, reload/reconnect: same asset, folder, location, uncertainty, and clock context.                                                                                        |
| Name/emoji defaults    | No asset type in data/editor/table. Save Tools with an emoji; the next new draft prefills both and permits changes. Cancel/failure leaves old defaults; defaults survive reload and are isolated per user/mission. |
| Folder order           | Create Zebra and Alpha in reverse order: Alpha first, both folder groups before root assets, including after rename/reload.                                                                                        |
| Column alignment       | Shared headers, expanded child rows, and root rows align at every width. Folder rows span all columns; name-cell indentation never moves other cells.                                                              |
| Membership/actions     | Drag or select to move into/between folders/root with one membership at most. Rename, duplicate with independent UUIDs, delete empty folders. Populated deletion blocked; no mandatory folder.                     |
| Folder/item visibility | Hide an item, hide/show folder: item stays hidden. Collapse alone never hides map content. Root/moved items apply correct gates.                                                                                   |
| Assets toggle          | Master-off removes every asset emoji/ring/label/highlight/hit target/preview, preserving list and shared flags. Other marker categories unaffected.                                                                |
| Asset Labels toggle    | With Assets on, labels-off hides names only; emojis/rings remain. Labels-on restores only visible assets' names.                                                                                                   |
| Two viewers            | Proposed shared folder/item visibility synchronizes; local Assets/Asset Labels preferences do not change the other viewer's display.                                                                               |
| Black editor           | Add/Edit use the same black top area with map placement/edit/cancel/save controls. Gestures update coordinates and keep editor open.                                                                               |
| Placement/PET          | Capture actual running REX identity/clock independent of selected view. No REX means timestamp/null clock. Delayed Save preserves capture; relocation recaptures, metadata/root moves do not.                      |
| Historical PET         | Paused/negative PET derives correctly; later live-clock changes, REX deletion, reload, and delayed rendering do not alter inferred placement PET.                                                                  |
| Cancel/failure         | Restore old location/context on Cancel; retain draft on failure. No deleted-target recreation, broken membership, or default changes from failed placement.                                                        |
| Tool cleanup           | Other tools, global/folder/item hide, minimize, navigation, permission/connection loss leave no stale map gesture.                                                                                                 |
| Uncertainty/copy       | Ground radius is correct and centered. Delete leaves no ring/label/membership. Folder/mission copy and exports preserve asset/context data.                                                                        |

## Coordination with the positions redesign

This branch owns Assets, folder/table integration, map display toggles/rendering, and minimal
widget/launcher/placeholder changes. The concurrent branch owns crew-position editor/table/domain
changes. The supplied black screenshot sets visual direction; no live Figma design was inspected.
Asset delivery must not depend on the concurrent redesign merging first.

Coordinate shared changes in rex-menu, MapOverlays, map-menu-pos, InteractionManager, thunkMap,
marker typing, folder helpers/components, and marker labels. Extract shared presentation only
where useful; retain separate asset/crew drafts. Review proposed required-name validation,
last-placement semantics/persistence, shared folder/item visibility, Save behavior, and folder
deletion before dependent work. Update acceptance scenarios with revised decisions.

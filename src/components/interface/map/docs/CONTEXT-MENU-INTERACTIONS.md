# Context Menu & Direct Map Interactions — Design Plan

**Status:** Draft / Planning  
**Date:** 2026-03-29  
**Depends on:** Phase 9 completion (OpenLayers is now default)  
**Update (2026-07):** POS entry markers migrated from `ol/Overlay` to OL vector features. Sections
that assumed POS-as-overlays (§6.6, §7.5, Phase E, §9.4 Q13) are revised — POS now hit-tests and
moves through the same feature path as every other marker.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Current State: The MapDirective Model](#2-current-state-the-mapdirective-model)
3. [Proposed Architecture](#3-proposed-architecture)
4. [Context Menu Design](#4-context-menu-design)
5. [Interaction Modes & State Machine](#5-interaction-modes--state-machine)
6. [Feature Specifications](#6-feature-specifications)
7. [Component & File Structure](#7-component--file-structure)
8. [Implementation Phases](#8-implementation-phases)
9. [Open Questions](#9-open-questions)

---

## 1. Motivation

### 1.1 Problems With the MapDirective Approach

The current interaction model is **indirect and panel-driven**. To place a station on the map, a user must:

1. Create a station (from the left nav or panel) — station appears in the list with `location: null`
2. Open the station's info panel on the right
3. Click "Create Location" button in the panel
4. This dispatches `thunkUpdateMapDirective({ mapItemType: "station", uuid, mapAction: "createMarker" })`
5. `InteractionManager` picks up the directive, sets crosshair cursor
6. User clicks the map — position saved, directive cleared

This round-trip through Redux → InteractionManager → map click → thunk → Redux works, but it has UX friction:

- **No spatial context at the point of action.** The user sees a checkbox cursor but has no visual feedback about _what_ they're placing or _what actions are available_ at a given point on the map.
- **Moving items requires navigating to a panel.** To move a station, you must select it, open its info pane, click "Edit on Map", drag it, then the directive auto-clears. There's no way to right-click a marker and choose "Move" directly.
- **No way to create items at a specific map location.** The panel-first flow creates an item with `location: null` and then asks the user to click the map. A map-first flow ("right-click here → create station at this point") would be more intuitive for spatial work.
- **No contextual information at the cursor.** The user can't right-click an empty spot and see its lat/lng, grid square, or elevation without moving their eyes to the bottom-of-map coordinate display.
- **Measurement creation is disconnected.** Measurements are created from the measure panel, get a default path from `measureInitialCoords`, then must be edited separately. Drawing directly on the map would be more natural.
- **No quick actions for existing markers.** Right-clicking a station, POI, or action should offer delete, move, rename, navigate-to-panel — standard GIS context menu patterns.

### 1.2 What OpenLayers Enables

OpenLayers provides first-class support for the interaction patterns we need:

- **`contextmenu` DOM events** on `map.getViewport()` — native right-click handling with pixel-to-coordinate conversion
- **`map.forEachFeatureAtPixel()`** — fast hit detection to determine what (if anything) was right-clicked
- **`ol/Overlay`** — position a real React DOM element at a map coordinate (perfect for context menus)
- **`ol/interaction/Draw`** — drawing new geometries (points, lines, polygons) with snapping, freehand, etc.
- **`ol/interaction/Translate`** and **`ol/interaction/Modify`** — already used in InteractionManager
- **Feature identity via `getId()`** — every feature on the map has its UUID, so click targets are unambiguous

---

## 2. Current State: The MapDirective Model

### 2.1 Redux State Shape

```typescript
// src/typings/map.d.ts
type MapAction =
  | "createMarker" // Crosshair cursor, one-shot click → save position
  | "cancelCreateMarker" // Clear directive, reset cursor
  | "editMarker" // Translate interaction on target feature
  | "cancelEditMarker" // Clear directive, reset cursor
  | "editPolyline" // Modify interaction (add/move/delete vertices)
  | "saveEditPolyline" // Remove interaction, clear directive
  | "cancelEditPolyline" // Revert path from DB, clear directive
  | "refreshLocation" // Sync display
  | "delete"; // Delete item

interface MapDirective {
  uuid: string;
  mapItemType: MapItemType; // "station" | "poi" | "action" | "lander" | "posEntry" | "traverse" | "walkback" | "measurement"
  mapAction: MapAction;
}

// store/map.ts — initialState
mapDirective: null; // null = no active interaction
```

### 2.2 Current Flow (Panel-Driven)

```
┌─────────────┐     dispatch(thunkUpdateMapDirective)     ┌──────────────┐
│  Info Panel  │ ──────────────────────────────────────► │ Redux store  │
│ "Edit on Map"│                                          │ mapDirective │
└─────────────┘                                          └──────┬───────┘
                                                                │
                                              useAppSelector    │
                                                                ▼
                                                     ┌──────────────────┐
                                                     │InteractionManager│
                                                     │  (switch/case)   │
                                                     │ sets cursor,     │
                                                     │ adds interaction │
                                                     └────────┬─────────┘
                                                              │
                                              user clicks/drags map
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │ Save thunk       │
                                                     │ (elevation, snap)│
                                                     │ dispatch(null)   │
                                                     └──────────────────┘
```

### 2.3 What We Keep vs. Replace

| Aspect                                               | Keep                          | Replace/Enhance             |
| ---------------------------------------------------- | ----------------------------- | --------------------------- |
| Redux as single source of truth                      | ✅                            | —                           |
| `mapDirective` in Redux for active interaction state | ✅ (enhanced)                 | Add new action types        |
| `InteractionManager` behavior component              | ✅ (extended)                 | Add new cases               |
| Thunks for saving positions/paths                    | ✅                            | —                           |
| Panel "Edit on Map" / "Create Location" buttons      | ✅ (keep as alternative path) | —                           |
| Panel-only creation flow                             | —                             | ✅ Add map-first creation   |
| No right-click support                               | —                             | ✅ Add context menu system  |
| No contextual info at cursor                         | —                             | ✅ Add info in context menu |

---

## 3. Proposed Architecture

### 3.1 Overview

The context menu and enhanced interactions add a **parallel entry point** to the existing MapDirective system. Both paths converge on the same thunks and Redux actions. The panel-driven flow remains for users who prefer it.

```
                          ┌───────────────────────────┐
                          │     Right-Click Map        │
                          │  (contextmenu event)       │
                          └─────────┬─────────────────┘
                                    │
                          ┌─────────▼─────────────────┐
                          │   Hit Detection            │
                          │  forEachFeatureAtPixel()   │
                          └─────────┬─────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
           Feature found                    No feature (empty spot)
                    │                               │
                    ▼                               ▼
         ┌──────────────────┐           ┌──────────────────┐
         │ Feature Context  │           │ Empty-Spot Context│
         │     Menu         │           │     Menu          │
         │                  │           │                   │
         │ • Move           │           │ • Lat/Lng display │
         │ • Delete         │           │ • Grid square     │
         │ • Properties...  │           │ • Elevation       │
         │ • Navigate to    │           │ ───────────────── │
         │   panel          │           │ • Create Station  │
         └────────┬─────────┘           │ • Create POI      │
                  │                     │ • Start Measure   │
                  │                     │ • Place Unplaced ▶│
                  │                     │   (submenu)       │
                  │                     └────────┬──────────┘
                  │                              │
                  │         User selects action  │
                  ▼                              ▼
         ┌──────────────────────────────────────────────┐
         │           Dispatch to Redux                   │
         │  updateMapDirective / direct thunk dispatch   │
         └──────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │InteractionManager│
                    │ (if interaction  │
                    │  is multi-step)  │
                    └──────────────────┘
```

### 3.2 Key Architectural Decisions

1. **Context menu is a React component rendered via `ol/Overlay`.** This gives us a real DOM element positioned at the clicked coordinate. React manages its lifecycle, and CSS handles styling. No imperative menu library needed.

2. **Context menu state is local React state, not Redux.** The menu's open/closed state and position are ephemeral UI state — they don't need to survive page navigation or be visible to other components. This keeps Redux focused on domain data.

3. **The context menu dispatches the same thunks and actions as the panel buttons.** No new save paths. The context menu is a new _entry point_ to existing logic.

4. **Multi-step interactions (move, draw polyline) still use `mapDirective` + `InteractionManager`.** The context menu initiates them; InteractionManager manages them. This preserves the "only one interaction active at a time" invariant.

5. **"Place Unplaced" submenu reads from Redux** to find stations/POIs/actions with `location === null`. This is a derived list, computed via a selector.

6. **Context menu is editor-only.** Dashboard and minimap modes get no context menu (they're read-only).

### 3.3 State Shape Additions

```typescript
// NEW: Local state within MapContextMenu component (NOT in Redux)
interface ContextMenuState {
  isOpen: boolean;
  coordinate: Coordinate; // OL coordinate where the right-click occurred
  aegisPoint: AEGISPoint; // Converted lat/lng
  pixel: Pixel; // Screen pixel for hit detection
  target: ContextMenuTarget; // What was right-clicked
}

type ContextMenuTarget =
  | { type: "empty" }
  | { type: "station"; uuid: string; station: Station }
  | { type: "poi"; uuid: string; poi: POI }
  | { type: "action"; uuid: string; action: Action }
  | { type: "lander" }
  | { type: "posEntry"; uuid: string }
  | { type: "traverse"; uuid: string }
  | { type: "walkback"; uuid: string }
  | { type: "measurement"; uuid: string };

// NEW MapAction additions (extend existing type)
type MapAction =
  | "createMarker"
  | "cancelCreateMarker"
  | "editMarker"
  | "cancelEditMarker"
  | "editPolyline"
  | "saveEditPolyline"
  | "cancelEditPolyline"
  | "refreshLocation"
  | "delete"
  // --- New ---
  | "drawPolyline"; // Click-to-add-waypoint drawing mode for measurements
```

---

## 4. Context Menu Design

### 4.1 Empty-Spot Menu

Shown when right-clicking a location on the map with no feature under the cursor.

```
┌──────────────────────────────┐
│  📍 -34.6284°, 138.2041°    │  ← Lat/Lng of click point
│  ⊞  Grid: L14-C             │  ← Grid square (if grid configured)
│  ▲  Elev: 1,247 m           │  ← Elevation (async fetch, shows spinner)
│ ─────────────────────────────│
│  ＋ Create Station here      │
│  ＋ Create POI here          │
│  📏 Start Measurement here   │
│ ─────────────────────────────│
│  📌 Place Existing Item ►   │  ← Only if unplaced items exist
│     ┌──────────────────────┐  │  Layer 1: type groups
│     │ 🔵 Stations (2)   ►  │  │  → flyout: unplaced station list
│     │ 🔴 POIs (1)        ►  │  │  → flyout: unplaced POI list
│     │ ⛏  Actions         ►  │  │  → flyout: grouped by parent ↓
│     └──────────────────────┘  │
└──────────────────────────────┘

   Actions flyout (layer 2 — grouped by parent):
   ┌───────────────────────────────────┐
   │ 🔵 Frodo (Station)    ►           │
   │   ┌────────────────────────────┐  │
   │   │ ⛏ Drill Sample             │  │
   │   │ ⛏ Collect Photo            │  │
   │   └────────────────────────────┘  │
   │ 🟢 Alpha Traverse     ►           │
   │ 🔴 Hawk (POI)         ►           │
   │ · Standalone (no parent)  ►       │
   └───────────────────────────────────┘
```

**Menu items:**

| Item                   | Action                                                                                                                     | Details                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lat/Lng display        | Informational (click-to-copy)                                                                                              | `toAegisPoint(coordinate)` formatted to reasonable precision                                                                                                                                                                                                                                                                                                                                                |
| Grid square            | Informational (click-to-copy)                                                                                              | `getGridCoordinatesFromPoint()` — only shown when grid is configured                                                                                                                                                                                                                                                                                                                                        |
| Elevation              | Informational                                                                                                              | Async: calls `thunkGetElevation` for the single point. Shows `⏳` spinner while loading, then elevation in meters. Cached for session.                                                                                                                                                                                                                                                                      |
| Create Station here    | Dispatch `thunkCreateStation`, then immediately `thunkUpdateStationLocation({ location, stationUuid })`                    | Creates + places in one step. Selects and opens panel.                                                                                                                                                                                                                                                                                                                                                      |
| Create POI here        | Dispatch `thunkCreatePoi`, then immediately `thunkUpdatePoiLocation({ location, poiUuid })`                                | Creates + places in one step.                                                                                                                                                                                                                                                                                                                                                                               |
| Start Measurement here | Dispatch `thunkAddNewMeasurement` with the clicked point as the starting coord, then enter `drawPolyline` interaction mode | Switches to polyline drawing. Click to add waypoints, double-click or Enter to finish.                                                                                                                                                                                                                                                                                                                      |
| Place Existing Item ▸  | Opens multi-level flyout of all items with `location === null`                                                             | **Layer 1** groups by type: Stations, POIs, Actions. Stations and POIs fan out to a flat list of unplaced items. **Actions** add a second flyout level grouped by parent: one entry per parent station/POI/traverse that has unplaced actions, plus a "Standalone" group for parentless actions. Selecting any leaf item dispatches the appropriate `thunkUpdate*Location` with the right-click coordinate. |

### 4.2 Feature Menu (Marker Right-Click)

Shown when right-clicking an existing marker (station, POI, action, lander, posEntry).

```
┌──────────────────────────────┐
│  🔵 Frodo  (Station)         │  ← Item name + type
│  📍 -34.6284°, 138.2041°    │  ← Current location
│  ▲  Elev: 1,247 m           │
│ ─────────────────────────────│
│  ✋ Move                      │  ← Enter translate mode
│  🗑 Remove Location           │  ← Set location to null (keep item)
│  📋 Copy Coordinates          │
│ ─────────────────────────────│
│  ▶  Open in Panel             │  ← Select + open right panel
│  🗑 Delete Item               │  ← Full delete (with confirmation)
└──────────────────────────────┘
```

**Menu items:**

| Item             | Action                                                                           | Details                                                                                    |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Item header      | Informational                                                                    | Icon + name + type label. Non-interactive.                                                 |
| Location display | Informational (click-to-copy)                                                    | Current lat/lng of the feature                                                             |
| Elevation        | Informational                                                                    | From the item's stored `elevation` field (no async fetch needed — already known)           |
| Move             | Dispatch `updateMapDirective({ uuid, mapItemType, mapAction: "editMarker" })`    | Same as clicking "Edit on Map" in the panel. Enters translate mode.                        |
| Remove Location  | Dispatch `upsertStationByField(uuid, "location", null)` (or equivalent per type) | Keeps the item in the itinerary but removes its map placement. Shows confirmation tooltip. |
| Copy Coordinates | Copy lat/lng string to clipboard                                                 | `navigator.clipboard.writeText(...)`                                                       |
| Open in Panel    | Dispatch `selectStation({ uuid })` + `thunkSetRightPanelIsOpenIfAuto(true)`      | Navigates the right panel to this item's info view                                         |
| Delete Item      | Dispatch delete thunk with confirmation dialog                                   | Uses existing `thunkDeleteStation` / `thunkDeletePoi` / etc. Should show "Are you sure?"   |

**Variations by item type:**

| Item Type | Move | Remove Location                   | Delete | Open in Panel            | Extra                                |
| --------- | ---- | --------------------------------- | ------ | ------------------------ | ------------------------------------ |
| Station   | ✅   | ✅                                | ✅     | ✅                       | —                                    |
| POI       | ✅   | ✅                                | ✅     | ✅                       | —                                    |
| Action    | ✅   | ✅                                | ✅     | ✅                       | —                                    |
| Lander    | ✅   | ❌ (lander always has location)   | ❌     | ✅ (opens mission prefs) | —                                    |
| POS Entry | ✅   | ❌ (POS entries = real-time data) | ❌     | ✅ (opens POS dialog)    | "Move" sets `posEntryInEdit` before dispatching `editMarker` (see §6.6) |

### 4.3 Polyline Menu (Traverse/Walkback/Measurement Right-Click)

Shown when right-clicking a polyline feature.

```
┌──────────────────────────────┐
│  📏 Alpha Traverse           │  ← Item name + type
│  Distance: 423 m             │
│ ─────────────────────────────│
│  ✏️  Edit Path                │  ← Enter modify mode
│ ─────────────────────────────│
│  ▶  Open in Panel             │
│  🗑 Delete                    │  ← Measurements only (traverses managed by EVA)
└──────────────────────────────┘
```

### 4.4 Context Menu During Active Interaction

When a `mapDirective` is already active (user is in move/edit/draw mode), the context menu should **not appear**. Right-click during an active interaction has interaction-specific behavior:

- **`editMarker` (Move):** Right-click cancels the move — same as pressing Escape. The marker is restored to its pre-drag `originalCoords`, the Translate interaction is removed, cursor is reset, and the directive is cleared. This gives the user an obvious escape hatch without needing to find a keyboard shortcut.
- **`editPolyline` (Modify):** Right-click is **ignored**. Vertex editing is a slow deliberate action; an accidental right-click mid-drag could cause an unintended cancel. The Escape key and the panel "Cancel Edit" button are the cancel affordances.
- **`drawPolyline` (Draw):** Right-click cancels the entire drawing and discards all placed vertices — same as Escape. This mirrors QGIS/ArcGIS conventions where right-click during polyline drawing aborts.

This prevents conflicting interactions and keeps the "one interaction at a time" invariant.

### 4.5 Keyboard Shortcuts During Interactions

| Key            | During Move (editMarker)     | During Edit Path (editPolyline) | During Draw (drawPolyline)                  |
| -------------- | ---------------------------- | ------------------------------- | ------------------------------------------- |
| Escape         | Cancel move, revert position | Cancel edit, revert path        | Cancel drawing, discard all vertices        |
| Enter          | —                            | Save edits                      | Finish drawing, save measurement            |
| Delete         | —                            | Delete selected vertex          | Remove last placed vertex                   |
| Ctrl+Z         | —                            | Undo last vertex edit           | Remove last placed vertex (same as Delete)  |
| Right-click    | Cancel (same as Escape)      | Ignored                         | Cancel (same as Escape)                     |
| Click last vtx | N/A                          | N/A                             | **Primary finish gesture** (see §4.6, §6.3) |

### 4.6 Cancellation & Confirmation Patterns

Cancel behavior varies by interaction type. The general principle: **easy-to-undo actions (moving a marker) can auto-commit on mouse release; hard-to-undo actions (delete, remove location) require explicit confirmation.**

#### editMarker (Move)

| Point in flow                             | Cancel affordance                                      | Result                                                                                |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| After entering move mode, before any drag | Escape, right-click map, or floating "✗ Cancel" button | Removes Translate interaction, restores cursor, clears directive — nothing saved      |
| Mid-drag (mouse button held)              | Escape key                                             | Releases drag, restores feature to `originalCoords`, clears directive — nothing saved |
| After `translateend` (mouse released)     | None — the drag has committed                          | Move is saved. Standard undo flow if available.                                       |

**Implementation:** Before mounting the `Translate` interaction, capture `originalCoords = feature.getGeometry().getCoordinates()`. Mount a `keydown` listener on `document` for Escape that sets a `cancelledRef = true` ref and calls `cleanup()`. The `translateend` handler checks `cancelledRef` before dispatching the save thunk — if cancelled, it calls `feature.getGeometry().setCoordinates(originalCoords)` and skips the save.

**Floating cancel button:** An `ol/Overlay` positioned at the feature's location shows a small "✗ Cancel" button while the Translate interaction is active. This gives mouse-only users a visible affordance. The overlay is destroyed when the directive clears (save or cancel). See open question §9.6 Q23.

#### editPolyline (Modify)

- **Cancel (revert):** Escape key OR the existing "Cancel Edit" button in the right panel. Both dispatch `cancelEditPolyline` → `revertTraversePath` / `revertWalkbackPath` → clear directive.
- **Save:** Enter key OR the existing "Save Edit" button in the right panel.
- No floating button needed; the panel buttons are the confirmation UI.

#### drawPolyline (Draw Measurement)

| Gesture                  | Result                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Click empty spot         | Add vertex, extend preview line                                                               |
| Click last placed vertex | **Finish drawing**, create measurement, switch to `editPolyline` mode for the new measurement |
| Enter key                | Finish drawing (keyboard alternative to re-clicking last vertex)                              |
| Escape or right-click    | Discard all vertices, clear directive → IDLE                                                  |

To make the "click last vertex to finish" affordance discoverable, the cursor changes to a ✓ snap ring when hovering within `clickTolerance` pixels of the last placed vertex. A minimum of 2 placed vertices is required before finishing is allowed.

**Implementation note:** OL's `Draw` interaction does not natively support "click last vertex to finish" for `LineString`. The implementation wraps it: after each vertex is committed, track `lastVertexCoord`. Before the draw interaction processes a new click, check if the click pixel is within `clickTolerance` of `lastVertexCoord` — if so, call `draw.finishDrawing()` and stop propagation.

#### Destructive Actions (Delete, Remove Location)

- **Delete Item:** Modal confirmation dialog — "Delete [name]? This cannot be undone." Uses the existing confirm dialog component.
- **Remove Location:** Two-step inline confirmation — first click shows "Confirm remove?" replacing the menu item text; second click executes. This avoids a full dialog for a less irreversible action (location can be re-set from the map or panel).

---

## 5. Interaction Modes & State Machine

### 5.1 Interaction State Transitions

```
                      ┌─────────────────┐
                      │                 │
                      │     IDLE        │◄──────────────────────────────┐
                      │  (no directive) │                               │
                      └───────┬─────────┘                               │
                              │                                         │
        ┌─────────────────────┼──────────────────────┐                  │
        │                     │                      │                  │
   right-click           panel button          panel button             │
   "Move"                "Edit on Map"         "Edit Path"              │
        │                     │                      │                  │
        ▼                     ▼                      ▼                  │
  ┌──────────┐        ┌──────────┐           ┌─────────────┐           │
  │editMarker│        │editMarker│           │editPolyline │           │
  │(Translate)│        │(Translate)│           │  (Modify)   │           │
  └─────┬────┘        └─────┬────┘           └──────┬──────┘           │
        │                   │                       │                   │
    drag ends           drag ends          ┌────────┼────────┐         │
        │                   │              │        │        │         │
        ▼                   ▼              ▼        ▼        ▼         │
   save thunk          save thunk      save btn  cancel  right-click   │
   clear directive     clear directive   save     revert   → cancel    │
        │                   │              │        │        │         │
        └───────────────────┴──────────────┴────────┴────────┘         │
                                    │                                   │
                                    └───────────────────────────────────┘

  ┌───────────────────────────────────────────────────────┐
  │ NEW: Draw Polyline Mode                               │
  │                                                       │
  │  right-click "Start Measurement" → drawPolyline       │
  │  ┌────────────────┐                                   │
  │  │   DRAWING      │                                   │
  │  │  (ol/Draw)     │                                   │
  │  │                │                                   │
  │  │ click = vertex │                                   │
  │  │ reclk last=end │                                   │
  │  │ Enter = end    │                                   │
  │  │ Esc = cancel   │                                   │
  │  └───────┬────────┘                                   │
  │          │                                            │
  │    drawend event                                      │
  │          │                                            │
  │          ▼                                            │
  │  save measurement thunk                               │
  │  clear directive → IDLE                               │
  └───────────────────────────────────────────────────────┘
```

### 5.2 Interaction Locking

The existing `InteractionManager` enforces "one interaction at a time" via `activeRef`. The context menu integrates with this:

1. **Before opening:** If `mapDirective !== null`, don't open the context menu.
2. **When starting an interaction from the menu:** Close the menu, dispatch `updateMapDirective`, let `InteractionManager` handle the rest.
3. **Direct actions (create-and-place, copy coords):** Don't need a mapDirective — they dispatch thunks directly, menu closes immediately.

---

## 6. Feature Specifications

### 6.1 Create Station at Map Point

**Trigger:** Right-click empty spot → "Create Station here"

**Flow:**

1. Context menu dispatches a thunk (new: `thunkCreateStationAtLocation`)
2. Thunk creates blank station (same as `thunkCreateStation`)
3. Thunk immediately calls `thunkUpdateStationLocation({ location: clickedPoint, stationUuid: newStation.uuid })`
4. Station appears on map at the clicked point with elevation auto-fetched
5. Station is selected, right panel opens to its info view
6. Menu closes

**Implementation:** New thunk wrapping existing `thunkCreateStation` + `thunkUpdateStationLocation`.

### 6.2 Create POI at Map Point

**Trigger:** Right-click empty spot → "Create POI here"

**Flow:** Same pattern as station. New thunk: `thunkCreatePoiAtLocation`.

### 6.3 Start Measurement at Map Point

**Trigger:** Right-click empty spot → "Start Measurement here"

**Flow:**

1. Context menu dispatches:
   - `setMeasureInitialCoords([clickedPoint])` — sets the starting coordinate
   - Measurement creation is deferred until drawing completes
2. Enters new `drawPolyline` interaction mode via `updateMapDirective({ uuid: <new-uuid>, mapItemType: "measurement", mapAction: "drawPolyline" })`
3. `InteractionManager` creates an `ol/interaction/Draw` with `type: "LineString"`
4. User clicks to add waypoints. A live preview line follows the cursor between placed vertices.
5. **Click the last placed vertex again** (within `clickTolerance` pixels) to finish — this is the primary gesture. A ✓ snap ring cursor appears when hovering over the last vertex to signal that clicking will finish. Enter key is the keyboard alternative. See §4.6 for the implementation approach.
6. On `drawend`:
   - Extract the completed path
   - Dispatch `thunkAddNewMeasurement()` (which uses the path)
   - Select the measurement, open measure panel
   - Clear directive → IDLE

**Implementation:** New `drawPolyline` case in `InteractionManager` using `ol/interaction/Draw`.

### 6.4 Place Unplaced Item

**Trigger:** Right-click empty spot → "Place Existing Item ▸" → navigate flyout → select item

**Flow:**

1. Top-level flyout shows up to three groups (only shown if that group has unplaced members):
   - **Stations (N)** ▸ → flat list of unplaced stations by name + icon
   - **POIs (N)** ▸ → flat list of unplaced POIs by name + icon
   - **Actions** ▸ → second-level flyout, grouped by parent:
     - One entry per parent station/POI/traverse that has ≥1 unplaced action → hovering opens a third-level list of those actions
     - "Standalone" group for actions with no parent (`stationUuid`, `poiUuid`, `traverseUuid` all null)
2. Selecting a leaf item (station, POI, or action name) dispatches the appropriate `thunkUpdate*Location` with the right-click coordinate
3. Item appears on map at the clicked point with elevation auto-fetched
4. Menu closes

**Why nest actions by parent?** Missions commonly have many unplaced actions (10–50+). A flat list would be unusable. Grouping by parent station/POI lets the user find the right action in context — "I want to place Kirk's sample action" → navigate to Kirk's group.

**Implementation:** `useUnplacedItems` hook (see §7.4) + dispatch existing thunks.

### 6.5 Move Marker via Context Menu

**Trigger:** Right-click existing marker → "Move"

**Flow:**

1. Context menu dispatches `updateMapDirective({ uuid, mapItemType, mapAction: "editMarker" })`
2. `InteractionManager` picks up the directive, creates `Translate` interaction
3. User drags marker to new position
4. On `translateend`, save thunk fires (elevation + cascading updates)
5. Directive cleared → IDLE

**Implementation:** No new code needed — just dispatches existing "editMarker" directive.

### 6.6 Move POS Entry via Context Menu

**Trigger:** Right-click POS entry marker → "Move"

POS entry markers are now `ol/Feature`s on the shared `posSource` (see PosEntries in
`../CLAUDE.md` §12) — the former `ol/Overlay` DOM markers were migrated to vector features. As a
result, moving a POS entry needs **no special path**: it flows through the same
`editMarker` → `Translate` (+ click-to-place) mechanism as stations/POIs, and
`InteractionManager` finds the feature via `getFeatureById`.

**Flow:**

1. Context menu sets `posEntryInEdit` to the target entry (the save thunk,
   `thunkDocUpdatePosEntryWithLocation`, asserts `posEntryUuid === posEntryInEdit.uuid`).
2. Context menu dispatches `updateMapDirective({ uuid, mapItemType: "posEntry", mapAction: "editMarker" })`.
3. `InteractionManager` attaches `Translate` to the feature; drag or click-to-place saves and clears.

**Implementation:** No new interaction code — only the `setPosEntryInEdit` + `editMarker` dispatch,
mirroring the existing "Edit Pos." button in `map-menu-pos.tsx`.

### 6.7 Elevation Display in Context Menu

**Trigger:** Right-click anywhere → elevation line in menu header

**Flow:**

1. When context menu opens at a coordinate, immediately dispatch `thunkGetElevation` for the single point
2. Menu shows `▲ Elev: ⏳` while loading
3. When elevation response arrives, update the display: `▲ Elev: 1,247 m`
4. Cache elevation results for the session to avoid re-fetching the same point

**Implementation:** `useEffect` inside the context menu component that fires when the menu opens. Local state for the elevation value.

### 6.8 Copy Coordinates

**Trigger:** Click the lat/lng line in any context menu, or right-click marker → "Copy Coordinates"

**Flow:**

1. Format the coordinates as a string: `-34.628412°, 138.204133°`
2. Write to clipboard via `navigator.clipboard.writeText()`
3. Brief tooltip flash: "Copied!" (or CSS animation on the menu item)

### 6.9 Contextual Info Display (Grid Square, Elevation)

For the **empty-spot menu header**, three lines of contextual info:

| Line        | Source                                      | Async?                                     |
| ----------- | ------------------------------------------- | ------------------------------------------ |
| Lat/Lng     | `toAegisPoint(coordinate)`                  | No — instant                               |
| Grid Square | `getGridCoordinatesFromPoint(point, ...)`   | No — computed from grid data in memory     |
| Elevation   | `thunkGetElevation({ path: [point], ... })` | **Yes** — HTTP call to `/api/v1/elevation` |

For **feature menus**, elevation comes from the item's stored `elevation` field (no fetch needed).

---

## 7. Component & File Structure

### 7.1 New Files

```
src/components/interface/map/
├── behaviors/
│   ├── InteractionManager.tsx          ← MODIFIED: add drawPolyline case
│   └── MapContextMenu.tsx              ← NEW: context menu behavior + renderer
├── overlays/
│   ├── ContextMenuOverlay.tsx          ← NEW: the actual menu UI (React component)
│   ├── ContextMenuItems.tsx            ← NEW: menu item components (EmptySpotMenu, FeatureMenu, etc.)
│   └── ContextMenuStyles.module.css    ← NEW: menu styling
├── hooks/
│   └── useUnplacedItems.ts             ← NEW: selector for items with location === null
├── utils/
│   └── contextMenuHitDetect.ts         ← NEW: hit detection + target resolution
```

### 7.2 `MapContextMenu.tsx` — Behavior Component

This is a headless behavior component (same pattern as `InteractionManager`). It:

1. Listens for `contextmenu` events on `map.getViewport()`
2. Prevents the browser default context menu
3. Performs hit detection to determine the target
4. Manages an `ol/Overlay` that positions the React context menu at the click point
5. Closes the menu on outside click, Escape, or map pan/zoom

```typescript
// Pseudo-structure
export function MapContextMenu(): ReactElement | null {
  const { map, mode } = useMap();
  const dispatch = useAppDispatch();
  const { toAegisPoint } = useCoordConverters();
  const mapDirective = useAppSelector(s => s.map.mapDirective, refEqual);

  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Only show in editor mode
  if (mode !== "editor") return null;

  // Set up contextmenu listener
  useEffect(() => {
    const viewport = map.getViewport();
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (mapDirective) return; // Don't open during active interaction

      const pixel: Pixel = [e.offsetX, e.offsetY];
      const coordinate = map.getCoordinateFromPixel(pixel);
      const target = resolveTarget(map, pixel);
      const aegisPoint = toAegisPoint(coordinate);

      setMenuState({ isOpen: true, coordinate, aegisPoint, pixel, target });
      overlayRef.current?.setPosition(coordinate);
    };

    viewport.addEventListener("contextmenu", handleContextMenu);
    return () => viewport.removeEventListener("contextmenu", handleContextMenu);
  }, [map, mapDirective, toAegisPoint]);

  // Close on Escape, outside click, map move
  // ...

  if (!menuState?.isOpen) return null;

  return createPortal(
    <div ref={menuRef}>
      <ContextMenuOverlay
        target={menuState.target}
        coordinate={menuState.coordinate}
        aegisPoint={menuState.aegisPoint}
        onClose={() => setMenuState(null)}
      />
    </div>,
    overlayElement
  );
}
```

### 7.3 `ContextMenuOverlay.tsx` — Menu UI

A styled React component that renders the appropriate menu items based on the target type. Uses CSS modules for styling.

### 7.4 `useUnplacedItems.ts` — Selector Hook

```typescript
interface UnplacedActionGroup {
  parentType: "station" | "poi" | "traverse" | "standalone";
  parentUuid: string | null;
  parentName: string; // display name for the flyout header
  parentIcon: string; // emoji/icon for the flyout header
  actions: Action[];
}

export function useUnplacedItems() {
  const stations = useAppSelector((s) => s.station.stations);
  const pois = useAppSelector((s) => s.poi.pois);
  const traverses = useAppSelector((s) => s.traverse.traverses);
  const actions = useAppSelector((s) => s.action.actions);

  return useMemo(() => {
    const unplacedActions = actions.filter((a) => a.location?.lat == null);

    // Group unplaced actions by their parent
    const grouped = new Map<string, UnplacedActionGroup>();
    for (const action of unplacedActions) {
      const key = action.stationUuid ?? action.poiUuid ?? action.traverseUuid ?? "standalone";
      if (!grouped.has(key)) {
        const parentStation = action.stationUuid
          ? stations.find((s) => s.uuid === action.stationUuid)
          : null;
        const parentPoi = action.poiUuid ? pois.find((p) => p.uuid === action.poiUuid) : null;
        const parentTraverse = action.traverseUuid
          ? traverses.find((t) => t.uuid === action.traverseUuid)
          : null;
        grouped.set(key, {
          parentType: parentStation
            ? "station"
            : parentPoi
              ? "poi"
              : parentTraverse
                ? "traverse"
                : "standalone",
          parentUuid: key === "standalone" ? null : key,
          parentName:
            parentStation?.name ?? parentPoi?.name ?? parentTraverse?.name ?? "Standalone",
          parentIcon: parentStation?.icon ?? parentPoi?.icon ?? "🟢",
          actions: [],
        });
      }
      grouped.get(key)!.actions.push(action);
    }

    return {
      stations: stations.filter((s) => s.location?.lat == null),
      pois: pois.filter((p) => p.location?.lat == null),
      actionGroups: Array.from(grouped.values()),
      hasAny:
        stations.some((s) => s.location?.lat == null) ||
        pois.some((p) => p.location?.lat == null) ||
        unplacedActions.length > 0,
    };
  }, [stations, pois, traverses, actions]);
}
```

### 7.5 `contextMenuHitDetect.ts` — Target Resolution

```typescript
export function resolveTarget(map: OLMap, pixel: Pixel): ContextMenuTarget {
  let target: ContextMenuTarget = { type: "empty" };

  map.forEachFeatureAtPixel(
    pixel,
    (feature, layer) => {
      const id = feature.getId() as string;
      const props = feature.getProperties();

      // Determine type from feature properties or layer metadata
      if (props.featureType === "station") {
        target = { type: "station", uuid: id, station: props.data };
      } else if (props.featureType === "poi") {
        target = { type: "poi", uuid: id, poi: props.data };
      }
      // ... etc.

      return true; // Stop after first hit
    },
    { hitTolerance: 8 }
  );

  // POS entries are vector features on posSource, so `forEachFeatureAtPixel`
  // resolves them here alongside every other marker — no separate DOM hit path.

  return target;
}
```

### 7.6 Integration Into AegisMapEditor

```tsx
// AegisMapEditor.tsx
<AegisMap mode="editor">
  <TileLayers />
  <StationMarkers />
  <PoiMarkers />
  {/* ... other behaviors ... */}
  <InteractionManager />
  <MapContextMenu /> {/* ← NEW */}
  <MapOverlays />
</AegisMap>
```

---

## 8. Implementation Phases

### Phase A — Context Menu Infrastructure

Build the scaffolding. Menu opens and shows coordinate info, but no actions.

- [ ] `MapContextMenu.tsx` behavior component: `contextmenu` listener, hit detection, Overlay management
- [ ] `ContextMenuOverlay.tsx` UI: styled menu container, close-on-escape, close-on-click-outside
- [ ] `contextMenuHitDetect.ts`: feature target resolution from `forEachFeatureAtPixel`
- [ ] Empty-spot menu header: lat/lng display, grid square, async elevation fetch
- [ ] "Copy Coordinates" action (click-to-copy)
- [ ] CSS styling (module CSS)
- [ ] Wire into `AegisMapEditor.tsx`
- [ ] Suppress context menu when `mapDirective` is active

### Phase B — Feature Context Menu

Right-click existing markers and polylines.

- [ ] Feature menu for stations: Move, Remove Location, Open in Panel, Delete
- [ ] Feature menu for POIs: same as stations
- [ ] Feature menu for actions: same, with parent context
- [ ] Feature menu for lander: Move, Open in Panel (no delete, no remove location)
- [ ] Feature menu for traverses: Edit Path, Open in Panel
- [ ] Feature menu for walkbacks: Edit Path, Open in Panel
- [ ] Feature menu for measurements: Edit Path, Delete, Open in Panel
- [ ] "Move" action: dispatches `editMarker` mapDirective
- [ ] "Edit Path" action: dispatches `editPolyline` mapDirective
- [ ] "Delete" action with confirmation dialog
- [ ] "Remove Location" with confirmation tooltip

### Phase C — Map-First Creation

Create items directly from the map.

- [ ] `thunkCreateStationAtLocation` — create + place in one step
- [ ] `thunkCreatePoiAtLocation` — create + place in one step
- [ ] "Create Station here" menu item wired to new thunk
- [ ] "Create POI here" menu item wired to new thunk
- [ ] `useUnplacedItems.ts` selector hook
- [ ] "Place Existing Item ▸" submenu with unplaced stations/POIs/actions
- [ ] Submenu item click → dispatch `thunkUpdate*Location`

### Phase D — Measurement Drawing

Draw measurements directly on the map.

- [ ] New `drawPolyline` MapAction type
- [ ] `InteractionManager` case for `drawPolyline` using `ol/interaction/Draw`
- [ ] "Start Measurement here" menu item
- [ ] Drawing cursor + visual feedback (partial line shown while drawing)
- [ ] Live segment distance/bearing labels during draw
- [ ] **"Click last placed vertex to finish"** — pre-click intercept checks proximity to `lastVertexCoord`, calls `draw.finishDrawing()` if within tolerance
- [ ] ✓ snap ring cursor when hovering last vertex (affordance for click-to-finish)
- [ ] Enter key as keyboard alternative to finish drawing
- [ ] `drawend` handler: extract path, create measurement, select, open panel
- [ ] Escape and right-click to cancel drawing (discard all vertices)
- [ ] Delete / Ctrl+Z to remove last placed vertex during drawing
- [ ] Minimum 2 vertices required before finish is allowed

### Phase E — POS Entry Interactions

POS entries are now vector features (migrated off `ol/Overlay`), so most of this phase collapses
into the general feature path — hit detection and Move come for free.

- [x] POS entry hit detection — resolved by `forEachFeatureAtPixel` like every other marker (done via the vector-feature migration)
- [ ] POS entry context menu: Move, Open in Panel
- [ ] "Move": set `posEntryInEdit`, then dispatch the standard `editMarker` directive (no custom drag handler needed — see §6.6)
- [ ] Save flow via `thunkDocUpdatePosEntryWithLocation` (already wired in `InteractionManager`'s `editMarker` case)

### Phase F — Polish & Keyboard

- [ ] Escape key handling during all interaction modes
- [ ] Enter to confirm during drawing
- [ ] Ctrl+Z undo during drawing
- [ ] Right-click during active interaction → cancel (for editMarker) or ignore (for editPolyline)
- [ ] Menu positioning: flip menu above/left when near map edges
- [ ] Submenu positioning: flip left when near right edge
- [ ] Accessibility: keyboard navigation within the menu, aria roles
- [ ] Touch device support: long-press to trigger context menu (if applicable)

---

## 9. Open Questions

These questions need answers before implementation can begin. They are grouped by topic.

### 9.1 Scope & Priority

1. **Should the context menu fully replace the panel-driven "Create Location" / "Edit on Map" buttons, or should both paths coexist permanently?** The plan assumes coexistence, but if the panel buttons should eventually be removed, the context menu needs to cover 100% of their functionality.

2. **Is "Create Station here" + "Create POI here" sufficient for map-first creation, or should "Create Action here" also be available from the empty-spot menu?** Actions are typically children of stations/POIs/traverses, so creating a standalone action from the map may not make sense. What's the desired behavior?

3. **Should the context menu be available on the dashboard map at all?** Current plan is editor-only. The dashboard is read-only, but a right-click menu showing coordinates/elevation/grid (info-only, no actions) could still be useful.

4. **How important is measurement drawing (Phase D) relative to the other features?** It's the most complex new interaction. Should it be prioritized, or is the current panel-based measurement creation acceptable for now?

### 9.2 UX Behavior

5. **What should happen when a user right-clicks a spot where multiple features overlap (e.g., a station marker on top of a traverse line)?** Options:
   - Show the topmost feature's menu (simplest)
   - Show the topmost feature's menu with a "Also here: Traverse Alpha" item to switch targets
   - Show a disambiguation submenu: "Which item?" → list all features at that pixel

6. **When "Move" is triggered from the context menu, should the drag start immediately (as if the user already grabbed the marker), or should the marker enter a "ready to drag" state where the user must click and drag it?** The current `editMarker` behavior requires the user to separately click-and-drag after entering edit mode. An option to start dragging immediately from the context menu click location could feel more direct.

7. **For "Remove Location", should there be a confirmation dialog, a toast with undo, or just instant removal?** Removing a station's location also clears walkback paths and invalidates traverse endpoints. Users should understand the impact.

8. **Should "Delete Item" in the feature context menu use modal confirmation ("Are you sure?") or an undo-toast pattern ("Item deleted. [Undo]")?** Both patterns exist in GIS tools.

9. **The "Place Existing Item" submenu groups Stations and POIs directly, and groups Actions by their parent station/POI/traverse.** _(Direction set — see §6.4.)_ Remaining sub-questions:
   - Should traverses with unplaced actions appear in the Actions flyout alongside stations and POIs?
   - For the station/POI flat lists, what happens if there are 20+ unplaced items — scrollable flyout, or a search/filter input at the top?
   - Should the parent group header (e.g., "Under Frodo") be selectable to place **all** of that parent's unplaced actions at once, or only individual actions are selectable?

### 9.3 Measurement Drawing

10. **What visual feedback should appear while drawing a measurement?** Options:
    - Live distance label updating as the cursor moves (like Google Maps distance tool)
    - Simple line following the cursor, no labels until finished
    - Live distance + bearing labels per segment

11. **Should the measurement drawing tool support closing the path into a polygon for area measurements, or is it strictly line-based?** Current measurements are `LineString` only.

12. **After finishing a measurement drawing, should the tool automatically re-enter draw mode for quick successive measurements, or return to idle?** Some GIS tools have a "keep measuring" toggle.

### 9.4 Technical Details

13. **RESOLVED — POS entries were migrated from `ol/Overlay` to OL vector features.** Hit detection now works through `forEachFeatureAtPixel`, and Move reuses the standard `editMarker`/`Translate` path. No POS-specific DOM hit detection or drag handler is needed (see §6.6, Phase E, and `../CLAUDE.md` §11–§12).

14. **Should elevation results be cached?** If the user right-clicks several nearby spots, re-fetching elevation each time is wasteful. A simple coordinate→elevation LRU cache (in the context menu component) would help. How aggressive should caching be?

15. **The `thunkUpdateMapDirective` currently wraps `updateMapDirective` with a 200ms `setTimeout` delay.** Context menu actions need to feel instant. Should context-menu-initiated directives bypass this delay and dispatch `updateMapDirective` directly? Or should the delay be removed globally?

16. **The context menu needs to be dismissed when the map pans or zooms** (otherwise it floats in the wrong spot as the map moves underneath). Should the menu also dismiss on scroll, or reposition itself to stay anchored to the map coordinate?

### 9.5 Interaction With Existing Features

17. **The `MarkerLabels` behavior currently suppresses labels when a `mapDirective` is active.** Should labels remain visible during context-menu-initiated interactions, or continue to be suppressed?

18. **Left-click currently selects items (stations, POIs, traverses).** Should left-click behavior change at all, or does the context menu only live on right-click? For example, should double-click open the context menu or the info panel?

19. **Should the context menu support actions on multiple selected items?** For example, multi-select stations and right-click to bulk-delete or bulk-move. This is a significant complexity increase — should it be deferred entirely?

### 9.6 Cancel & Confirm UX

23. **For `editMarker` (Move), should the floating "✗ Cancel" button appear on the map, or is Escape-only sufficient?** The floating button adds a visible affordance for mouse-only users but requires an `ol/Overlay` that tracks the feature position during drag.

24. **After a drag completes (`translateend`) and the save thunk has fired, should there be a short undo window?** For example, a toast: "Frodo moved. [Undo]" with a 5-second timeout. This would require restoring the previous position and re-running cascade thunks on undo — significant but possible.

25. **For `editPolyline`, should Enter (save) and Escape (cancel) apply globally (via a document-level `keydown` listener), or only when the map canvas has focus?** Global listeners could conflict with typing in right-panel input fields that happen to be open simultaneously.

26. **Should the `drawPolyline` "click last vertex to finish" snap tolerance be the same as OL's built-in `clickTolerance` option, or a separate (larger) value?** A larger snap ring makes finishing easier but could accidentally trigger when placing two closely spaced vertices.

### 9.7 Edge Cases

20. **What happens if the user right-clicks while an elevation fetch is still loading from a previous context menu?** Should the previous fetch be cancelled (`AbortController`), or allowed to complete silently?

21. **Should the context menu work when the map is in a loading/error state (e.g., tiles not loaded, no mission loaded)?** Probably should be disabled, but worth confirming.

22. **Should "Create Station here" respect folder structures?** Currently stations can belong to folders. When creating from the map, which folder should the new station be placed in — root, the currently selected folder, or should the user be prompted?

---

_This document is a living plan. Update it as questions are answered and decisions are made._

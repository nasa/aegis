# OpenLayers Map — Claude Code Context

Read this before touching anything under `src/components/interface/map/`. It is the
architecture + bug-fixing reference for the OpenLayers (OL) map.

OL is the **only** map implementation. The old Leaflet code, npm packages, and the
`?ol` feature flag are gone — don't look for a toggle. (Note: `src/pages/testMapPerformant.tsx`
is a standalone experimental sandbox route, NOT part of the real map — ignore it unless
explicitly working on it.)

---

## 1. Mental model

The map is a tree of **headless behavior components**. Each returns `null`, reads Redux +
Automerge state, and imperatively manipulates the OL `Map` instance obtained from
`useMapContext()`. There is no single "render the map" function — each behavior owns exactly
one concern (one layer, one interaction, one overlay) and reconciles it against state in a
`useEffect`.

```
<MapMenuProvider>              // eyeball display toggles (+ cookie persistence)
  <FeatureSourcesProvider>     // shared VectorSources
    <AegisMap mode=...>        // renders container div + <MapProvider>
      <MapProvider>            // creates the ol/Map, registers projection, sets the View
        <TileLayers/>          // ← behavior components, all return null
        <StationMarkers/>
        <InteractionManager/>
        <MapOverlays/>         // ← React UI drawn over the canvas (NOT ol/Overlay)
        ...
```

### The three entry points

| File                    | `mode`        | Notes                                                                                                                                                                                                      |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AegisMapEditor.tsx`    | `"editor"`    | Full feature set. Self-wraps `FeatureSourcesProvider`. Only editor has POI/measurement/interaction/highlight/timeline behaviors and zoom controls.                                                         |
| `AegisMapDashboard.tsx` | `"dashboard"` | Adds `FollowModeProvider` + `FollowMode` behavior. No editing behaviors.                                                                                                                                   |
| `AegisMapMinimap.tsx`   | `"minimap"`   | Stripped down. Adds `BigMapBoundsBox` + `AutoFitBounds`. Non-interactive. Has no eyeball menu, but mirrors the dashboard menu's scale-bar + traverse-arrow toggles via `DashboardBoundsProvider` (see §2). |

`MapMode` is defined in `src/typings/map/ol.d.ts` (`"editor" | "dashboard" | "minimap"`).

> **Provider-nesting contract (implicit and load-bearing):** `AegisMapDashboard` and
> `AegisMapMinimap` do **NOT** self-wrap `FeatureSourcesProvider` or `DashboardBoundsProvider`.
> The dashboard **page** (`src/pages/dashboard.tsx`) must wrap _both_ maps in a single shared
> `FeatureSourcesProvider` + `DashboardBoundsProvider` so they share sources and viewport sync.
> If a dashboard/minimap is rendered without those ancestors, `useContext` throws. Each map
> still wraps its own `MapMenuProvider`.

---

## 2. Providers / context

- **`MapProvider`** — creates the single `ol/Map` (once), registers the projection with proj4,
  builds the `View`, provides `{ map, mode }` via `MapContext` / `useMapContext()`.
  - The map is created **once** when projection config first arrives and disposed only on
    unmount. There is intentionally **no cleanup in the init effect** — it must survive
    re-renders and dependency changes. A `mapRef` guard prevents recreation.
  - A `ResizeObserver` calls `map.updateSize()`. Zoom controls only added in editor mode.
  - `MapContext` is exported so tests can stub it with a hand-rolled `Map`.
- **`FeatureSourcesProvider`** — creates ONE `VectorSource` per feature type (`useMemo([])`)
  shared across sibling maps. See §5. **Do not add deps to that `useMemo`** or sources get
  recreated and orphan every layer.
- **`MapMenuProvider`** — all "eyeball menu" display toggles. Split into value context
  (`useMapMenuContext`) + setter context (`useMapMenuSetters`) so value readers don't re-render
  on setter reference. Persists to the `AEGIS_Map_Menu_Settings` cookie. Each map has its own
  provider (separate state trees) but they **share the cookie** — a change on one map persists
  and loads into the other on next mount; live changes are not synced. **Exception:** the minimap
  has no menu of its own and mirrors the dashboard menu's `showScaleBar` + `showArrows` **live**
  via `DashboardBoundsProvider` — see the bridge components in `MapMenuMinimapBridge.tsx`
  (`DashboardMenuPublisher` pushes those two values from the dashboard menu into the shared
  context; `MinimapMenuSubscriber` copies `showArrows` back into the minimap's own provider so
  `TraverseLines` reads it; the minimap's `ScaleBar` is gated on the shared `showScaleBar`).
- **`FollowModeProvider`** (dashboard only) — `followMode` toggle + per-item `followModeOptions`
  keyed `"stations"`, `"traverses"`, and each running-REX pos-type uuid. Rebuilds pos-type
  options when the running REX's `posTypes` change.
- **`DashboardBoundsProvider`** — lifts the dashboard map's viewport `Extent` (projected CRS)
  into context so the minimap can draw the bounds box + auto-fit. Both maps must share a
  projection for the box to render correctly. Also carries the two eyeball toggles the minimap
  mirrors from the dashboard menu (`showScaleBar`, `showArrows`) — the shared dashboard↔minimap
  channel for those values (see `MapMenuProvider` above).

---

## 3. Projections & coordinates

Projections are registered once in `MapProvider` via `proj4.defs()` + `register(proj4)`.
Three projection paths:

- **Custom non-Mercator** (lunar polar stereographic etc.): `projIsCustom` + a proj4 string +
  custom resolutions/extent. `projCode` = the `projEpsg` value.
- **Custom "Mercator"**: `projEpsg === "EPSG:3857"` but custom → `projCode` = `AEGIS:{missionId}`.
- **Default**: `EPSG:3857`.

**`useCoordConverters()`** (`hooks/useCoordConverters.ts`) returns `toMapCoord` /
`toAegisPoint` / `projCode`. `createCoordConverters()` is a pure factory (testable without React).

Bug-prone details:

- **lng/lat order**: `toMapCoord` packs `[point.lng, point.lat]`; `toAegisPoint` destructures
  `[lng, lat]`. Getting this backwards is the classic coordinate bug.
- `toMapCoord` returns `[0, 0]` (projection origin) for a null lat/lng — **fails silently**, not
  an error.
- The projection **must be registered** before the converters run (MapProvider handles it).
- The `projCode` derivation logic is **duplicated** in `MapProvider` and `useCoordConverters` —
  keep them in sync or the View and the converters target different CRS.
- Distances/bearings for traverses/measurements are computed **geodesically from lat/lng**
  (haversine, LGRS-aware via `usingLGRSCoordinates`) in `utils/mapping/geoMath.ts`, **not** from
  projected geometry — projected length over-reports on distorted projections (Web Mercator
  ≈ sec(lat)) and near the pole. `TimelineAstronaut` interpolates position with
  `LineString.getCoordinateAt()` in projected CRS (fine — it's a screen position, not a distance).

Tile resolutions for legacy raster layers come from `buildLegacyResolutions()`
(`utils/parsers/leafletShim.ts`). **Critical:** use the API `projResUnitsPerPixel`, NOT the XML
`units-per-pixel` — only the API value yields tile coords that exist on S3. This is documented
in three places (leafletShim, tilemapResource, layerFactory); don't "fix" it.

---

## 4. Feature reconciliation — the biggest footgun

`utils/featureReconciler.ts` → `reconcileFeatures(source, items, mapper, createFeature?)`:
diffs desired items (by stable `uuid` used as OL feature id) against `source.getFeatures()`,
then adds/updates/removes **without recreating features** (preserves OL identity, selection,
hover, drag state). Used by most marker/line behaviors.

Traps that cause real bugs:

1. **Properties are MERGED, not replaced.** `feature.setProperties(props, /*silent*/true)` only
   sets keys present in the descriptor. **Stale keys are never removed.** This is the root cause
   behind the measurement/traverse "withhold segment arrays while editing then ignore the stale
   ones" dance (see §6).
2. **Change detection is shallow (`!==`).** If a prop value is an object/array mutated in place
   (same reference), the update is skipped and no redraw happens. Callers must pass new references.
3. **`feature.changed()` only fires when geometry or a prop actually changed.** Some behaviors
   (`PoiMarkers`, `StationMarkers`) additionally call `source.changed()` after reconcile to force
   an icon repaint.
4. **`geometryEquals` compares `getType()` + `JSON.stringify(getCoordinates())`.** Only valid for
   `SimpleGeometry`. Geometries without `getCoordinates` both stringify to `undefined` → treated
   equal → geometry update silently dropped. Also a perf hotspot for huge coordinate arrays.
5. **Features with no id are always removed** in pass 1.
6. **Duplicate ids in `items`**: last wins (silent dedup).

---

## 5. Shared feature sources

`FeatureSourcesProvider` creates one `VectorSource` per type:
`stationSource, traverseSource, posSource, posPathSource, circleSource, poiSource, actionSource,
walkbackSource, measurementSource, highlightSource, labelSource`.

- One instance per page, **shared across dashboard + minimap**. Each map builds its own
  `VectorLayer` (with per-mode styles) over the shared source. A feature mutation redraws on
  **every** sibling map's layer.
- **Consequence:** per-map visual differences must live in the **per-layer style function**, not
  in feature geometry/props. Reconciling a shared source in one mode's component mutates the
  features every map sees.
- **All marker labels** (lander/station/poi/action/pos) live on the single shared `labelSource`,
  not on the marker layers — this enables one overlap-dimming pass and the drag-to-reposition
  system (`MarkerLabels` + `ol/interaction/Translate`). See §8 MarkerLabels.

Some behaviors deliberately use their **own** (non-shared) sources: `Grid`, `Circles`,
`HoverHighlight`, `SelectionHighlight`, `BigMapBoundsBox`.

---

## 6. Editing & interactions (the subtle part)

`InteractionManager.tsx` maps `state.map.mapDirective` (Redux) to exactly one active OL
interaction at a time (`Translate` / `Modify`) + click/pointermove handlers + cursor. UI
components dispatch `updateMapDirective(...)`. Directives: `createMarker`, `editMarker`,
`editPolyline`, and their `cancel*`/`save*` variants.

Key behaviors:

- **`findFeatureOnMap(map, id)`** iterates every layer source by id — OL has no global feature
  registry. **Walkback features use a prefixed id `walkback-${uuid}`** (matches `WalkbackLines`).
  If the feature isn't found, the directive is cleared.
- **Auto-cancel-on-navigate:** when an edit becomes active, `InteractionManager` snapshots a
  `selectionKey` (section + selected poi/station/seq-item/measurement). If that key later changes,
  it dispatches `updateMapDirective(null)`. This prevents a stale `Modify`/`Translate` surviving a
  context switch — the bug it fixes let you "drag when not in edit mode" and crashed on the next
  edit. posEntry edits are excluded from this watcher.
- **Endpoint pinning** (traverse/walkback): first/last coords are pinned to the neighbouring
  station/lander. `Modify` `condition`/`deleteCondition` block grabbing/deleting endpoint vertices
  within `ENDPOINT_PIXEL_TOLERANCE` (10px, matches OL default); the vertex style hides the
  drag-anchor on pinned endpoints; a `restoreEndpoints` "change" listener re-pins as a safety net
  (guarded against re-entrancy). Measurements are free-form (endpoints movable).
- **Throttled live save** (100ms) on geometry "change" during a drag. Measurements compute
  distances/bearings **synchronously** into `upsertMeasurement` for a real-time timeline, plus an
  async elevation fetch. `modifyend` flushes the throttle then does the full save (traverse awaits
  for endpoint snapping + elevation).

> **The edit-drag detach hazard (recurring).** While a line feature is under OL `Modify`, any
> `feature.changed()` fires OL's internal `handleFeatureChange_`, which **clears `dragSegments_`
> and detaches the drag**. Because `reconcileFeatures` calls `feature.changed()` on any
> geometry/prop change, `TraverseLines`, `WalkbackLines`, and `MeasurementLines` all set the
> feature's **geometry to `null` and withhold per-tick props** (segment bearings/distances) while
> their feature is being edited. The stale withheld props linger (merge-not-replace, §4), so the
> style functions **deliberately ignore** the stale arrays during editing and recompute live. If
> you touch any of these three behaviors or the reconciler, preserve this dance.

Every interactive behavior computes `editActive = !!mapDirective` and disables its own
click/hover/drag while any directive is active, so reference features stay visible but
non-interactive — the edited item is manipulated only by `InteractionManager`.

---

## 7. Layers, tiles & presets (`TileLayers`)

`TileLayers.tsx` owns ALL raster/vector/PMTiles/COG data layers. It computes the desired set via
`getLayersToShow()` and reconciles into `activeLayersRef` (keyed by sublayer uuid).

- **Data layers use NEGATIVE z-indices** (`-(index+1)`, index 0 = top of the UI list) so they
  always sit below every feature layer (z ≥ 0). `getLayersToShow` returns UI order (index 0 = top
  of panel); the caller inverts for zIndex.
- **Preset hot-swap:** on `selectedPresetUuid` change, ALL layers are torn down
  (`clearVisualStyle` + `removeLayer`) and rebuilt from scratch. Preset switching is expensive and
  can flash. Also clears tracking if the `map` instance itself changed (old layers belong to a
  disposed map).
- **Custom tile grid only for `projIsCustom` (non-Mercator).** Mercator missions must use the
  default EPSG:3857 grid — their `projBounds`/`projOrigin` are in degrees, not meters, and would
  produce an invalid grid.
- **PMTiles vector-tile sources are attached asynchronously** (`attachPmtilesSource` reads archive
  metadata + builds the tile grid) after the layer is created, to avoid blocking initial render. A
  blank vector-tile layer usually means that async step failed — check the console warns.
- **COG layers** are detected by `.tif`/`.tiff` path extension (no `type: "cog"` in the schema
  yet) → `createCogLayer` (`WebGLTileLayer` + `GeoTIFF`).
- `map.render()` is called after reconcile to force tile loading on initial mount (OL may not
  schedule it otherwise before the first paint).
- Layer factory lives in `utils/layers/layerFactory.ts` (`createOlLayer` / `createCogLayer` /
  `buildVectorStyleFn`). Note two different `buildTileGrid` functions exist (`layerFactory` vs
  `parsers/esriPMTiles`) — import carefully.
- **GeoJSON `dataProjection` is resolved per document**, not hardcoded. `createVectorLayer`
  installs a custom `VectorSource` loader that fetches the file and asks
  `utils/parsers/geojsonProjection.ts` whether it is lon/lat or already in the mission's own
  projected metres (embedded `crs` member first, whole-document coordinate bounds as the
  fallback). A malformed document or an unrecognized projected CRS **fails the load** rather
  than being reinterpreted as `EPSG:4326`.
- **Draggable data-layer labels.** Two flavours, both styled by `utils/styles/gazetteerLabels.ts`
  and both marked with the layer property `movableLabels`:
  - _Gazetteer/nomenclature_ — matched by sublayer name (`isGazetteerSublayer`) or by
    property-sniffing the loaded features (`isGazetteerFeatures`). The whole layer renders as
    label images; name-matched ones use a plain `VectorLayer` (not `VectorImageLayer`) so
    Translate hit-tests the live frame.
  - _Thematic_ — for per-feature-coloured polygon/line classes, `createThematicLabelFeatures`
    appends a synthetic Point anchor per feature (`thematicLabel: true`) and flags the layer
    `thematicLabels`; the source feature's inline text is suppressed via
    `hasMovableThematicLabel`.
    `TileLayers` owns the `ol/interaction/Translate` for both (skipped on the minimap and while
    an edit directive is active, same rule as `MarkerLabels`). Dragged positions are **not**
    persisted — they reset on preset switch or reload.
- **TMS Y-flip** has two branches: custom tileGrid flips Y manually via
  `getFullTileRange(z).maxY - y` (the `{-y}` URL template does NOT work with custom grids);
  default grid uses `url.replace("{y}", "{-y}")`. A broken TMS layer usually means missing/misbuilt
  `projConfig`.
- **Visual styles** (opacity/filters/blend) applied via `utils/visualStyleApplicator.ts`. Multiple
  layers share one `ol-layer` canvas, so CSS on the DOM canvas is forbidden — filters/blend go
  through `prerender`/`postrender` (`ctx.save()`/`ctx.restore()`). If `postrender` doesn't fire or
  its context is null, the `restore()` leaks state to sibling layers. Opacity uses native
  `layer.setOpacity()`.
- Time-based sublayers: `getLayersToShow` → `resolveTimePath` → a time layer is **silently skipped**
  when the map time moves out of the manifest bounds. Active time comes from `useMapDateTime()`
  (priority: preset preview time → selected EVA datetime → first time-based sublayer datetime).

---

## 8. Styling

All OL `Style`/`StyleFunction` objects live in `utils/styles/` — **never inline in a component**.

**Golden rule: never `new Style(...)` inside a style function** — it allocates every frame. Cache
outside. The style builders each keep a `Map` cache; know its **key**, because a bug often means
a cache key omits a varying input:

- `markers.ts` (`buildStation/Poi/Action/LanderStyleFunction`): keyed by emoji + selection
  (+ in-progress). **`iconSize` is NOT in the key** — it's captured at builder-creation time, so a
  size change requires rebuilding the whole builder, not re-calling it. Selected marker →
  `zIndex 9999`; dashboard in-progress stations get a green ring (triggered by
  `config.station.hoverable === false`).
- `markerLabels.ts` (`createMarkerLabelStyle`): caches the rendered text-box canvas by
  `name-labelType-fontSize`. Draws a dashed black+white connector from label to anchor (skipped
  when the label is within 2px of the anchor). Opacity applied via `Icon.opacity`, not baked.
- `polylines.ts`: module-level `baseStyleCache` for traverse lines (keyed
  `color|weight|selectedWeight|isSelected`) + `arrowCache` for chevron SVG data-URIs. Selected
  "glow" only pushed when `selectedWeight > 0` (dashboard/minimap set it to 0 = no emphasis).
  Measurement style hardcodes label colors and ignores stale segment arrays while editing.
- `posPath.ts`: style cache is **cleared wholesale when size > 500** (crude cap). Has its own
  duplicate `arrowCache`.
- `gazetteerLabels.ts` (`createGazetteerLabelStyle`): draggable data-layer labels (see §7). Two
  per-builder caches — the label image keyed `name|colors|dpr`, and the composited
  label+tether image additionally keyed by the **rounded pixel** offset to the original
  location (stable while panning, recomputed per zoom step; cleared wholesale past 500).
  Both the plain and the tethered image anchor on the label's bottom-centre so a label
  doesn't shift the instant it's dragged. Honours `showLabels` opt-out style
  (`=== false` hides; undefined shows), matching `buildVectorStyleFn`.
- `emojiRenderer.ts`: unbounded canvas cache keyed `emoji-size`. A failed lander SVG load caches a
  **blank** canvas permanently (sticky failure until cache clears).

`utils/labelLayout.ts` computes overlap-based opacity for the shared label layer. Priority:
lander 0 > station 1 > poi 2 > action 3 > pos 4 (lower = higher priority, always opaque, drawn on
top, dims lower-priority overlaps via point-sampled union coverage).

---

## 9. Z-index / layer ordering

`utils/zIndex.ts` (`Z_INDEX`, higher = on top). **These are feature-LAYER z-indices**, distinct
from feature/style zIndexes hardcoded in style files (e.g. `9999` for a selected marker, 100/150/200
for labels).

```
data/tile layers  : negative (managed by TileLayers, below everything)
CIRCLES           : 6
GRID_LINES        : 7
GRID_LABELS       : 8
POLYLINES         : 10   (traverse / walkback / measurement share this)
LANDER            : 11
ACTIONS           : 12
STATIONS          : 14
POIS              : 15
HOVER             : 18
SELECTION         : 19   (also BigMapBoundsBox)
PLACE_LABELS      : 20   (MarkerLabels)
POS_ENTRIES       : 22   (POS paths)
POS_MARKERS       : 23   (POS markers, above paths + labels)
TIMELINE_ASTRONAUT: 28
```

Gaps (4–5, 9, 13, 16–17, 21, 24–27) are intentional insertion room. The `ol/Overlay` DOM node
for the timeline astronaut renders above all vector layers regardless.

---

## 10. Mode config

`utils/modeConfig.ts` → `MODE_CONFIGS[mode]` (mode from `useMapContext()`). Same rendering
algorithm everywhere; only the numbers/flags differ per mode. Behaviors read from it rather than
branching on mode. Sections: `map`, `lander`, `station`, `circle`, `traverse`, `markerLabel`,
`pos`, `grid`. Notable flags that gate behavior:

- editor: fully interactive; `station.zIndexOffset: 2000`; draggable/hoverable stations.
- dashboard: larger icons, `tooltipOpacity 0.65`, `hoverable: false` (→ in-progress green ring),
  `traverse.selectedWeight: 0` (no selection glow).
- minimap: `map.interactive: false`, tooltips off, no bearings/distances, `pos.drawPathWeight: false`,
  `grid.labelsEnabled: false`.

POS path line weight is `pos.drawPathWeight` (editor 2px, dashboard 5px, minimap `false` = off).

POI and Action markers **reuse the `station` config** (iconSize, clickable, hoverable, draggable).

---

## 11. Overlays

`overlays/MapOverlays.tsx` is a React UI subtree positioned over the canvas (**not** `ol/Overlay`):
eyeball menu (`map-menu.tsx`), preset selector (`map-menu-preset.tsx`), follow menu (dashboard),
`ScaleBar`, `MouseCoordinateDisplay`, sun/earth compass (`map-sunearth.tsx`), POS menu
(`map-menu-pos.tsx` + `map-menu-pos-menu.tsx`).

Distinct from these, `ol/Overlay` (a real DOM node anchored to a coordinate) is used for the
**timeline astronaut** (`TimelineAstronaut`). POS markers are **not** overlays — they are vector
features on `posSource` styled by `buildPosMarkerStyleFunction` (stacked posType icons + color
bars), so they hit-test, edit, and z-order like every other marker (see §12 PosEntries).

Overlay gotchas:

- Dashboard menus are hover-gated (mouseenter/mouseleave on `map.getTargetElement()`); if the
  target element isn't ready when the effect runs, listeners silently don't attach.
- `MouseCoordinateDisplay` needs BOTH `config.map.showMouseCoords` (editor) AND the eyeball toggle.
- `ScaleBar` assumes resolution == meters/pixel — only exact for a metric projected CRS;
  approximate on EPSG:3857 away from the equator. Updates on `moveend` only.

---

## 12. Behavior component reference

| Component            | Owns                                                   | Mode        | Reconciler                   | Notes                                                                                                                                           |
| -------------------- | ------------------------------------------------------ | ----------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `TileLayers`         | all data layers (neg z) + label Translate              | all         | layer-level                  | preset hot-swap, async PMTiles, COG by ext, per-document GeoJSON CRS, draggable gazetteer/thematic labels                                       |
| `Grid`               | own line + label layers                                | all         | rebuild on view move         | resolved server-file/dynamic LGRS source; animation-frame-throttled adaptive density                                                            |
| `Circles`            | own circle layers                                      | all         | **full rebuild** each change | dashed altColor = 2× layers; dupes station visibility logic                                                                                     |
| `TraverseLines`      | shared `traverseSource`                                | all         | ✅                           | geodesic bearings/distances; edit-drag detach dance                                                                                             |
| `WalkbackLines`      | shared `walkbackSource`                                | all         | ✅                           | feature id `walkback-${uuid}`; edit-drag dance                                                                                                  |
| `MeasurementLines`   | shared `measurementSource`                             | editor      | ✅                           | edit-drag dance; new measurements spawn at viewport thirds                                                                                      |
| `StationMarkers`     | shared `stationSource`                                 | all         | ✅                           | dashboard in-progress green ring; drag = selected only                                                                                          |
| `PoiMarkers`         | shared `poiSource`                                     | all         | ✅                           | selected POI always shown; `source.changed()` repaint                                                                                           |
| `ActionMarkers`      | shared `actionSource`                                  | all         | ✅                           | shown only when parent selected + eyeball on; STM (v2) action label built from the definition via `getActionDisplayName` (not `action.name`)    |
| `LanderMarker`       | own source                                             | all         | single feature `"lander"`    | disabled mid-edit (sits on traverse endpoint)                                                                                                   |
| `MarkerLabels`       | shared `labelSource`                                   | editor/dash | layout pass                  | single overlap-dim + drag-reposition system; freezes PET during drag; action labels use `getActionDisplayName` (STM v2 → built from definition) |
| `PosEntries`         | shared `posSource` (markers) + `posPathSource` (paths) | all         | ✅ markers / rebuild paths   | only when section=="evas" & selectedRex; epsilon egress skip; keeps edited entry visible                                                        |
| `InteractionManager` | active Translate/Modify                                | editor      | —                            | one interaction at a time; auto-cancel-on-navigate                                                                                              |
| `HoverHighlight`     | own source                                             | editor      | —                            | clones hovered geometry; POS resolved from REX (not vector)                                                                                     |
| `SelectionHighlight` | own source + auto-pan                                  | editor      | —                            | one target via priority chain; pans only outside viewport & not mid-edit                                                                        |
| `TimelineAstronaut`  | `ol/Overlay`                                           | editor      | —                            | `getCoordinateAt(fraction)`; `percentElapsed === 0` is valid                                                                                    |
| `FollowMode`         | drives `view.fit()`                                    | dashboard   | —                            | sorts pos entries newest-first (documented fix); publishes `bigMapExtent`                                                                       |
| `AutoFitBounds`      | drives `view.fit()`                                    | minimap     | —                            | fits objects + dashboard box                                                                                                                    |
| `BigMapBoundsBox`    | own source                                             | minimap     | rebuild                      | draws dashboard viewport box                                                                                                                    |

---

## 13. Recurring hazards (checklist when debugging)

1. **Edit-drag detach** — `reconcileFeatures`→`feature.changed()`→OL `Modify` clears `dragSegments_`.
   Traverse/Walkback/Measurement withhold geometry+props while editing. (§6)
2. **Merge-not-replace props** — stale feature props never clear; pass new object references. (§4)
3. **Shared sources** — mutating one affects every sibling map; per-map diffs go in the style fn. (§5)
4. **Style cache keys** — a change to an input not in the key (e.g. `iconSize` in markers) needs
   the builder rebuilt, not re-called. (§8)
5. **lng/lat order & silent `[0,0]`** in coord converters. (§3)
6. **projCode duplicated** in MapProvider vs useCoordConverters. (§3)
7. **Duplicated logic to keep in sync:**
   - Station visible-set: `StationMarkers`, `Circles`, `MarkerLabels`.
   - POS latest/filter/egress-skip: `PosEntries` (epsilon `1e-7°`) vs `MarkerLabels` (exact float
     equality — **known inconsistency**).
   - Pos-entry ordering: `FollowMode` sorts newest-first; `AutoFitBounds` does **not** (candidate
     stale-tracking bug).
8. **"First running REX" assumption** in `FollowModeProvider`, `useRexPetTime`, `MapFollowMenu`,
   `map-menu` — mismatches with "selected REX" used elsewhere.
9. **Effects that reset user state** on REX/source change: `map-menu` sourceUuids reset,
   `map-menu-pos` `posEntryInEdit` reset, `FollowModeProvider` option rebuild — can clobber
   in-progress edits/selections.
10. **Custom vs Mercator tile grid** — Mercator must use default EPSG:3857 grid. (§7)

---

## 14. Tests

```bash
npm run test:vitest            # Unit — src/tests/vitest/map/ (pure utils: reconciler, coord
                               #   converters, layer factory, parsers, styles, layout, ...)
npm run test:vitest:browser    # Browser mode — src/tests/vitest-browser/map/ (one file per
                               #   behavior + integration + screenshot tests)
```

Nearly every behavior and util has a matching test file (`Foo.tsx` → `Foo.browser.test.tsx` or
`foo.ts` → `foo.test.ts`). Add/update the matching test with any change. Shared OL test helpers
live in `src/tests/vitest/map/helpers/` (`createTestCoordConverters`, `registerTestProjections`,
test constants) and `src/tests/vitest-browser/map/helpers/`.

After changes, run the full gate: `npm run test:all` (lint → tsc → build → vitest → browser).

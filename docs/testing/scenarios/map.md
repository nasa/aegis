# Map display, selection and geometry interactions

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Located planning and execution fixtures with known coordinates and map observer; deterministic asset fixtures for visual variants.

Source: [src/components/interface/map/AegisMapEditor.tsx](../../../src/components/interface/map/AegisMapEditor.tsx), [src/components/interface/map/behaviors/InteractionManager.tsx](../../../src/components/interface/map/behaviors/InteractionManager.tsx), [src/components/interface/map/CLAUDE.md](../../../src/components/interface/map/CLAUDE.md).

Scenario mapping: **19/19 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest-browser/map/InteractionManager.browser.test.tsx](../../../src/tests/vitest-browser/map/InteractionManager.browser.test.tsx), [src/tests/vitest-browser/map/SelectionHighlight.browser.test.tsx](../../../src/tests/vitest-browser/map/SelectionHighlight.browser.test.tsx).

## MAP-001: POIs labels change rendered content and their preference survives reload

**P1 · Mapped**

Action: POIs labels change rendered content and their preference survives reload

Expected: POI labels contain known values, toggling changes rendered pixels, and the preference survives reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:67](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L67) — POIs labels change rendered content and their preference survives reload (chromium, firefox, webkit).

## MAP-002: Stations labels change rendered content and their preference survives reload

**P1 · Mapped**

Action: Stations labels change rendered content and their preference survives reload

Expected: Station labels contain known values, toggling changes rendered pixels, and the preference survives reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:67](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L67) — Stations labels change rendered content and their preference survives reload (chromium, firefox, webkit).

## MAP-003: hiding POIs preserves the selected POI until it is deselected

**P1 · Mapped**

Action: hiding POIs preserves the selected POI until it is deselected

Expected: Hidden POIs retain the selected POI feature until deselection; saved mission data is unchanged.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:117](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L117) — hiding POIs preserves the selected POI until it is deselected (chromium, firefox, webkit).

## MAP-004: clicking a real station marker selects that station and its information

**P1 · Mapped**

Action: clicking a real station marker selects that station and its information

Expected: Clicking the real Bravo station marker selects its exact station and information panel.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:136](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L136) — clicking a real station marker selects that station and its information (chromium, firefox, webkit).

## MAP-005: scale bar visibility survives reload without changing mission data

**P1 · Mapped**

Action: scale bar visibility survives reload without changing mission data

Expected: Scale-bar visibility survives reload without changing the mission document.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:179](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L179) — scale bar visibility survives reload without changing mission data (chromium, firefox, webkit).

## MAP-006: dragging an interior vertex then Finished preserves endpoints and the intended path after reload

**P1 · Mapped**

Action: dragging an interior vertex then Finished preserves endpoints and the intended path after reload

Expected: Finishing an interior vertex drag persists the changed interior path with unchanged endpoints after reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:198](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L198) — dragging an interior vertex then Finished preserves endpoints and the intended path after reload (chromium, firefox, webkit).

## MAP-007: dragging an interior vertex then Cancel preserves endpoints and the intended path after reload

**P1 · Mapped**

Action: dragging an interior vertex then Cancel preserves endpoints and the intended path after reload

Expected: Canceling an interior vertex drag restores the original path with unchanged endpoints after reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:198](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L198) — dragging an interior vertex then Cancel preserves endpoints and the intended path after reload (chromium, firefox, webkit).

## MAP-008: Reset Path removes intermediate vertices and retains its neighboring stations

**P1 · Mapped**

Action: Reset Path removes intermediate vertices and retains its neighboring stations

Expected: Reset Path removes interior vertices and retains the neighboring station endpoints in persisted geometry.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:244](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L244) — Reset Path removes intermediate vertices and retains its neighboring stations (chromium, firefox, webkit).

## MAP-009: traverse endpoints cannot be detached from their stations by dragging

**P1 · Mapped**

Action: traverse endpoints cannot be detached from their stations by dragging

Expected: Dragging a traverse endpoint cannot detach it from its owning station.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:271](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L271) — traverse endpoints cannot be detached from their stations by dragging (chromium, firefox, webkit).

## MAP-010: navigating out of an edit removes its map interaction

**P1 · Mapped**

Action: navigating out of an edit removes its map interaction

Expected: Navigating away from a path edit removes the interaction and preserves the original saved path.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:288](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L288) — navigating out of an edit removes its map interaction (chromium, firefox, webkit).

## MAP-011: Map selection and highlight precedence

**P1 · Mapped**

Action: Select/hover POI, station, traverse, EVA, action and position, including stale higher-priority selection.

Expected: The intended marker/path is highlighted, unresolved selections fall back correctly, and transient hover does not change persisted selection.

Playwright: [src/tests/playwright/behavior/mapSelection.spec.ts:78](../../../src/tests/playwright/behavior/mapSelection.spec.ts#L78) — selection context wins over stale selections, while POI station traverse action and position hover stays transient (chromium).

Playwright: [src/tests/playwright/behavior/mapSelection.spec.ts:269](../../../src/tests/playwright/behavior/mapSelection.spec.ts#L269) — selecting and hovering a crew position highlights the resolved position without changing mission data (chromium).

Evidence boundary: Uses UI selection of station, POI, EVA and traverse with independent rendered highlight/feature assertions, including stale station and POI selections losing precedence in their inactive scope. Real pointer hover verifies POI, traverse and action overlays clear again; execution position hover/select resolves its highlight. Mission snapshots remain unchanged through transient hovers and position selection.

## MAP-012: Selection pan and zoom preservation

**P1 · Mapped**

Action: Select visible and off-screen entities before/after initial load and during geometry editing.

Expected: Pan occurs only under the intended conditions and preserves zoom and the active edit target.

Playwright: [src/tests/playwright/behavior/mapSelection.spec.ts:189](../../../src/tests/playwright/behavior/mapSelection.spec.ts#L189) — selection pans only to off-screen targets, preserves zoom, and geometry edits keep their target (chromium).

Evidence boundary: Selects a visible station without moving the initial center and an off-screen POI which pans to its known projected target without changing zoom; reload returns to the initial view. A real traverse vertex drag updates then Cancel restores the saved path. Selecting that off-screen POI during editing safely ends the edit, pans to its target at the same zoom, and preserves the traverse path.

## MAP-013: Map directive entry and exit matrix

**P0 · Mapped**

Action: For POI, station, action, walkback, traverse and position editing exercise Finish, Cancel, Escape, Edit off and navigation.

Expected: Each supported exit commits or discards exactly as specified; interactions, cursor and overlays are removed and the next selection works.

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:159](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L159) — Escape dismisses a field dialog before cancelling the POI marker edit and preserving its point (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:186](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L186) — turning Edit off exits a pending POI placement without creating a coordinate (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:302](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L302) — Escape restores a dragged traverse and removes the modify interaction (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:364](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L364) — Escape cancels an existing position edit without saving a map move (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — poi edit exits cleanly through Escape without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — poi edit exits cleanly through Edit off without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — poi edit exits cleanly through navigation without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — station edit exits cleanly through Escape without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — station edit exits cleanly through Edit off without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — station edit exits cleanly through navigation without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — action edit exits cleanly through Escape without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — action edit exits cleanly through Edit off without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — action edit exits cleanly through navigation without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — walkback edit exits cleanly through Escape without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — walkback edit exits cleanly through Edit off without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — walkback edit exits cleanly through navigation without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — traverse edit exits cleanly through Escape without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — traverse edit exits cleanly through Edit off without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:346](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L346) — traverse edit exits cleanly through navigation without changing its saved geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:395](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L395) — position edit exits cleanly through Escape without changing its saved position (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:395](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L395) — position edit exits cleanly through Edit off without changing its saved position (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:395](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L395) — position edit exits cleanly through navigation without changing its saved position (chromium).

Playwright: [src/tests/playwright/behavior/entityLocations.spec.ts:242](../../../src/tests/playwright/behavior/entityLocations.spec.ts#L242) — POI location create, move, field edit, cancel, clear, and reload preserve the point contract (chromium).

Playwright: [src/tests/playwright/behavior/entityLocations.spec.ts:366](../../../src/tests/playwright/behavior/entityLocations.spec.ts#L366) — action location create, move, cancel, clear, and Set to Station keep parent identity and reload (chromium).

Playwright: [src/tests/playwright/behavior/stationGeometry.spec.ts:195](../../../src/tests/playwright/behavior/stationGeometry.spec.ts#L195) — station location creation, cancellation, lander shortcut, and missing terrain preserve valid geometry (chromium).

Playwright: [src/tests/playwright/behavior/stationGeometry.spec.ts:366](../../../src/tests/playwright/behavior/stationGeometry.spec.ts#L366) — walkback edit cancel, finish, rate metrics, reset, and reload preserve pinned endpoints (chromium).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:198](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L198) — dragging an interior vertex then Finished preserves endpoints and the intended path after reload (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:198](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L198) — dragging an interior vertex then Cancel preserves endpoints and the intended path after reload (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:288](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L288) — navigating out of an edit removes its map interaction (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:307](../../../src/tests/playwright/behavior/positions.spec.ts#L307) — Cancel Pos abandons a new entry and removes the pending map placement (chromium).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:335](../../../src/tests/playwright/behavior/positions.spec.ts#L335) — moving an existing position commits coordinates only while Save and Cancel control metadata drafts (chromium).

Evidence boundary: The new directive matrix exercises POI, station, action, walkback, traverse and execution-position editing through Escape, Edit off and navigation, asserting cleared cursor/Cancel state, exact saved target state, and a usable next selection. Focused supporting lifecycle cases cover Finish and Cancel for marker, path, station and position workflows, including persisted/derived state and interaction cleanup.

## MAP-014: Map point placement and removal

**P0 · Mapped**

Action: Place/move/clear station, POI and action coordinates using known map pixels and an independent projection oracle.

Expected: Committed lat/lng and derived geometry match the intended location; Cancel preserves prior coordinates.

Playwright: [src/tests/playwright/behavior/mapDirectives.spec.ts:211](../../../src/tests/playwright/behavior/mapDirectives.spec.ts#L211) — station location can be cancelled, cleared, and recreated from a known map pixel (chromium).

Playwright: [src/tests/playwright/behavior/entityLocations.spec.ts:242](../../../src/tests/playwright/behavior/entityLocations.spec.ts#L242) — POI location create, move, field edit, cancel, clear, and reload preserve the point contract (chromium).

Playwright: [src/tests/playwright/behavior/entityLocations.spec.ts:366](../../../src/tests/playwright/behavior/entityLocations.spec.ts#L366) — action location create, move, cancel, clear, and Set to Station keep parent identity and reload (chromium).

Playwright: [src/tests/playwright/behavior/stationGeometry.spec.ts:195](../../../src/tests/playwright/behavior/stationGeometry.spec.ts#L195) — station location creation, cancellation, lander shortcut, and missing terrain preserve valid geometry (chromium).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:307](../../../src/tests/playwright/behavior/positions.spec.ts#L307) — Cancel Pos abandons a new entry and removes the pending map placement (chromium).

Playwright: [src/tests/playwright/behavior/positions.spec.ts:335](../../../src/tests/playwright/behavior/positions.spec.ts#L335) — moving an existing position commits coordinates only while Save and Cancel control metadata drafts (chromium).

Evidence boundary: UI coverage now supports clearing station coordinates through the existing location update path, gated with station location edit permission and pending-save state. A real-map scenario cancels an edit and pending placement, clears authoritative location/elevation/walkback values, checks the connected traverse remains valid, verifies the station and walkback disappear from the map, reloads, then recreates at a known map pixel and checks independent Web Mercator coordinates and persistence. POI/action tests cover their own known-pixel placement, clear, cancel, feature geometry and reload contracts; position tests add projected point/persistence evidence.

## MAP-015: Map visibility by scope and entity

**P1 · Mapped**

Action: Toggle each entity/label/path/circle category for planned, selected, active and historical scopes.

Expected: Exact feature membership and visibility follow scope and selected-object exceptions, without stale features on switching.

Playwright: [src/tests/playwright/behavior/mapVisibilityLabels.spec.ts:148](../../../src/tests/playwright/behavior/mapVisibilityLabels.spec.ts#L148) — planned and selected entity visibility follows location, enabled state, parent scope and toggles (chromium).

Playwright: [src/tests/playwright/behavior/positionRendering.spec.ts:105](../../../src/tests/playwright/behavior/positionRendering.spec.ts#L105) — marker types, source paths and PET ages remain scoped to active, historical and planned REX views (chromium).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:117](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L117) — hiding POIs preserves the selected POI until it is deselected (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/stationCircles.spec.ts:69](../../../src/tests/playwright/behavior/stationCircles.spec.ts#L69) — station circle visibility and style stay local and render the defined metre radius (chromium).

Evidence boundary: The new planned/selected scope test asserts exact station, POI, action, walkback and circle feature membership. It covers located versus unlocated markers, disabled actions, station/POI selected-object exceptions, action parent-selection rules, and the walkback/circle toggles. Existing active/historical REX coverage supplies actual position marker, label, and path visibility across planned, active and historical views; separate supporting tests verify selected POI and circle visibility.

## MAP-016: Map label accuracy and readability

**P1 · Mapped**

Action: Use colliding, long, multiline and edge-of-viewport labels at several zooms.

Expected: Text content, placement, clipping, halo and priority remain readable; a known visual baseline catches missing or misplaced content.

Playwright: [src/tests/playwright/behavior/mapVisibilityLabels.spec.ts:243](../../../src/tests/playwright/behavior/mapVisibilityLabels.spec.ts#L243) — colliding long and multiline labels keep exact text, priority, fixed offset and readable rendered ink across zooms (chromium).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:67](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L67) — POIs labels change rendered content and their preference survives reload (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:67](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L67) — Stations labels change rendered content and their preference survives reload (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/positionRendering.spec.ts:105](../../../src/tests/playwright/behavior/positionRendering.spec.ts#L105) — marker types, source paths and PET ages remain scoped to active, historical and planned REX views (chromium).

Evidence boundary: The new visual contract checks exact label text including a multiline name, map-projected anchor, feature offset of 28 screen pixels at zooms 12/16/19, colliding label priority opacity, actual label-canvas width/height and non-background text pixels, plus a long label placed at the viewport edge. Existing label-toggle tests verify the rendered map changes and label preferences survive reload; execution coverage verifies exact numbered PET/source text for active and historical positions.

## MAP-017: Pan zoom resize and map lifecycle

**P1 · Mapped**

Action: Pan, use controls/double-click/zoom limits, resize and repeatedly mount/unmount editor.

Expected: Expected centre/zoom and visible geometry persist with one live map and no orphan interactions or render errors.

Playwright: [src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts:34](../../../src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts#L34) — map pan, controls, double-click and viewport resizing retain one usable editor through remounts (chromium).

Evidence boundary: Real pointer pan, zoom buttons/double-click, upper zoom of 28 and viewport-derived lower world bound, resize preserving centre/zoom, three remounts with one connected map, stable interaction count, visible geometry and unchanged authoritative mission.

## MAP-018: Mouse coordinates, grid and units

**P1 · Mapped**

Action: Hover known points under Earth, lunar stereographic and custom Mercator projections.

Expected: Lat/lng order, grid reference and coordinate precision match independent expected values in each CRS.

Playwright: [src/tests/playwright/behavior/gridCoordinates.spec.ts:120](../../../src/tests/playwright/behavior/gridCoordinates.spec.ts#L120) — mouse coordinates show independent lat/lng order, precision and grid reference in three CRSs (chromium).

Evidence boundary: Real pointer movement over the known map center checks six-decimal lat/lng order and exact grid references for Earth Web Mercator (Known-2-2), canonical lunar south-LPS (AZM B95 D44), and custom Mercator (Known-2-1).

## MAP-019: QuickMap handoff

**P1 · Mapped**

Action: Open POI, station, traverse, EVA and crew-position links with located and missing prerequisites.

Expected: The generated URL contains the correct coordinates, geometry, color and time, and unavailable links are gated.

Playwright: [src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts:105](../../../src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts#L105) — POI, station, traverse, EVA and crew handoffs encode known geometry, colors and time and gate missing locations (chromium).

Evidence boundary: Real UI handoffs capture window.open URLs without opening the external service. Exact POI/station/traverse and crew point/path geometry, plan sequence feature collection and explicit/fallback colors, EVA UTC, projection/stack/resolution, independent centers, and missing lander/entity/path/position gates.

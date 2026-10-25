# Map display, selection and geometry interactions

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Located planning and execution fixtures with known coordinates and map observer; deterministic asset fixtures for visual variants.

Source: [src/components/interface/map/AegisMapEditor.tsx](../../../src/components/interface/map/AegisMapEditor.tsx), [src/components/interface/map/behaviors/InteractionManager.tsx](../../../src/components/interface/map/behaviors/InteractionManager.tsx), [src/components/interface/map/CLAUDE.md](../../../src/components/interface/map/CLAUDE.md).

Scenario mapping: **12/19 (63.2%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest-browser/map/InteractionManager.browser.test.tsx](../../../src/tests/vitest-browser/map/InteractionManager.browser.test.tsx), [src/tests/vitest-browser/map/SelectionHighlight.browser.test.tsx](../../../src/tests/vitest-browser/map/SelectionHighlight.browser.test.tsx).

## MAP-001: POIs labels change rendered content and their preference survives reload

**P1 · Mapped**

Action: POIs labels change rendered content and their preference survives reload

Expected: POI labels contain known values, toggling changes rendered pixels, and the preference survives reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:60](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L60) — POIs labels change rendered content and their preference survives reload (chromium).

## MAP-002: Stations labels change rendered content and their preference survives reload

**P1 · Mapped**

Action: Stations labels change rendered content and their preference survives reload

Expected: Station labels contain known values, toggling changes rendered pixels, and the preference survives reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:60](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L60) — Stations labels change rendered content and their preference survives reload (chromium).

## MAP-003: hiding POIs preserves the selected POI until it is deselected

**P1 · Mapped**

Action: hiding POIs preserves the selected POI until it is deselected

Expected: Hidden POIs retain the selected POI feature until deselection; saved mission data is unchanged.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:110](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L110) — hiding POIs preserves the selected POI until it is deselected (chromium).

## MAP-004: clicking a real station marker selects that station and its information

**P1 · Mapped**

Action: clicking a real station marker selects that station and its information

Expected: Clicking the real Bravo station marker selects its exact station and information panel.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:129](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L129) — clicking a real station marker selects that station and its information (chromium).

## MAP-005: scale bar visibility survives reload without changing mission data

**P1 · Mapped**

Action: scale bar visibility survives reload without changing mission data

Expected: Scale-bar visibility survives reload without changing the mission document.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:172](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L172) — scale bar visibility survives reload without changing mission data (chromium).

## MAP-006: dragging an interior vertex then Finished preserves endpoints and the intended path after reload

**P1 · Mapped**

Action: dragging an interior vertex then Finished preserves endpoints and the intended path after reload

Expected: Finishing an interior vertex drag persists the changed interior path with unchanged endpoints after reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:191](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L191) — dragging an interior vertex then Finished preserves endpoints and the intended path after reload (chromium).

## MAP-007: dragging an interior vertex then Cancel preserves endpoints and the intended path after reload

**P1 · Mapped**

Action: dragging an interior vertex then Cancel preserves endpoints and the intended path after reload

Expected: Canceling an interior vertex drag restores the original path with unchanged endpoints after reload.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:191](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L191) — dragging an interior vertex then Cancel preserves endpoints and the intended path after reload (chromium).

## MAP-008: Reset Path removes intermediate vertices and retains its neighboring stations

**P1 · Mapped**

Action: Reset Path removes intermediate vertices and retains its neighboring stations

Expected: Reset Path removes interior vertices and retains the neighboring station endpoints in persisted geometry.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:237](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L237) — Reset Path removes intermediate vertices and retains its neighboring stations (chromium).

## MAP-009: traverse endpoints cannot be detached from their stations by dragging

**P1 · Mapped**

Action: traverse endpoints cannot be detached from their stations by dragging

Expected: Dragging a traverse endpoint cannot detach it from its owning station.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:264](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L264) — traverse endpoints cannot be detached from their stations by dragging (chromium).

## MAP-010: navigating out of an edit removes its map interaction

**P1 · Mapped**

Action: navigating out of an edit removes its map interaction

Expected: Navigating away from a path edit removes the interaction and preserves the original saved path.

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:281](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L281) — navigating out of an edit removes its map interaction (chromium).

## MAP-011: Map selection and highlight precedence

**P1 · Gap**

Action: Select/hover POI, station, traverse, EVA, action and position, including stale higher-priority selection.

Expected: The intended marker/path is highlighted, unresolved selections fall back correctly, and transient hover does not change persisted selection.

## MAP-012: Selection pan and zoom preservation

**P1 · Gap**

Action: Select visible and off-screen entities before/after initial load and during geometry editing.

Expected: Pan occurs only under the intended conditions and preserves zoom and the active edit target.

## MAP-013: Map directive entry and exit matrix

**P0 · Gap**

Action: For POI, station, action, walkback, traverse and position editing exercise Finish, Cancel, Escape, Edit off and navigation.

Expected: Each supported exit commits or discards exactly as specified; interactions, cursor and overlays are removed and the next selection works.

## MAP-014: Map point placement and removal

**P0 · Gap**

Action: Place/move/clear station, POI and action coordinates using known map pixels and an independent projection oracle.

Expected: Committed lat/lng and derived geometry match the intended location; Cancel preserves prior coordinates.

## MAP-015: Map visibility by scope and entity

**P1 · Gap**

Action: Toggle each entity/label/path/circle category for planned, selected, active and historical scopes.

Expected: Exact feature membership and visibility follow scope and selected-object exceptions, without stale features on switching.

## MAP-016: Map label accuracy and readability

**P1 · Gap**

Action: Use colliding, long, multiline and edge-of-viewport labels at several zooms.

Expected: Text content, placement, clipping, halo and priority remain readable; a known visual baseline catches missing or misplaced content.

## MAP-017: Pan zoom resize and map lifecycle

**P1 · Mapped**

Action: Pan, use controls/double-click/zoom limits, resize and repeatedly mount/unmount editor.

Expected: Expected centre/zoom and visible geometry persist with one live map and no orphan interactions or render errors.

Playwright: [src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts:34](../../../src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts#L34) — map pan, controls, double-click and viewport resizing retain one usable editor through remounts (chromium).

Evidence boundary: Real pointer pan, zoom buttons/double-click, upper zoom of 28 and viewport-derived lower world bound, resize preserving centre/zoom, three remounts with one connected map, stable interaction count, visible geometry and unchanged authoritative mission.

## MAP-018: Mouse coordinates, grid and units

**P1 · Gap**

Action: Hover known points under Earth, lunar stereographic and custom Mercator projections.

Expected: Lat/lng order, grid reference and coordinate precision match independent expected values in each CRS.

## MAP-019: QuickMap handoff

**P1 · Mapped**

Action: Open POI, station, traverse, EVA and crew-position links with located and missing prerequisites.

Expected: The generated URL contains the correct coordinates, geometry, color and time, and unavailable links are gated.

Playwright: [src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts:105](../../../src/tests/playwright/behavior/mapLifecycleHandoff.spec.ts#L105) — POI, station, traverse, EVA and crew handoffs encode known geometry, colors and time and gate missing locations (chromium).

Evidence boundary: Real UI handoffs capture window.open URLs without opening the external service. Exact POI/station/traverse and crew point/path geometry, plan sequence feature collection and explicit/fallback colors, EVA UTC, projection/stack/resolution, independent centers, and missing lander/entity/path/position gates.

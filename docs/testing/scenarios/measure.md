# Measurements and terrain profiles

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Local measurements and saved traverse/walkback paths crossing known DEM values and no-data cells.

Source: [src/store/thunk/thunkMeasurement.ts](../../../src/store/thunk/thunkMeasurement.ts), [src/server/express/routes/terrainProfile.ts](../../../src/server/express/routes/terrainProfile.ts), [src/utils/paperSlope.ts](../../../src/utils/paperSlope.ts), [src/components/interface/slope-legend.tsx](../../../src/components/interface/slope-legend.tsx).

Scenario mapping: **8/8 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/measurement_thunk.test.ts](../../../src/tests/vitest/store/thunks/measurement_thunk.test.ts), [src/tests/vitest/express/terrainProfile.test.ts](../../../src/tests/vitest/express/terrainProfile.test.ts), [src/tests/vitest/server/terrain/calculateTerrainSlope.golden.test.ts](../../../src/tests/vitest/server/terrain/calculateTerrainSlope.golden.test.ts), [src/tests/vitest-browser/SlopeLegend.browser.test.tsx](../../../src/tests/vitest-browser/SlopeLegend.browser.test.tsx), [src/tests/vitest-browser/PaperSlope.browser.test.ts](../../../src/tests/vitest-browser/PaperSlope.browser.test.ts).

## MEASURE-001: Measurement create edit and cancel

**P1 · Mapped**

Action: Create a measurement, add/drag/remove vertices, finish, cancel a second edit and delete it.

Expected: Known distances/bearings update; Cancel restores the prior local path and unrelated mission data never changes.

Playwright: [src/tests/playwright/behavior/measurementTerrain90.spec.ts:209](../../../src/tests/playwright/behavior/measurementTerrain90.spec.ts#L209) — measurement editing inserts, drags and removes vertices, and cancel restores the original local path (chromium).

Evidence boundary: Covers local measurement creation, vertex insertion/drag/removal, finalized distance and bearing updates, canceled-edit rollback, and mission-document isolation. Rollback failed before the InteractionManager measurement restore branch was added, then passed after the fix.

## MEASURE-002: Measurement local state and navigation

**P1 · Mapped**

Action: Change measurement tabs and bottom panes, switch mission and reload.

Expected: Selection does not spuriously recenter the map and local-only measurements obey their explicit lifetime.

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:54](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L54) — temporary measurement tabs preserve the map view and stay local through navigation at zoom 17 (chromium).

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:54](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L54) — temporary measurement tabs preserve the map view and stay local through navigation at zoom 19 (chromium).

Evidence boundary: Two zoom variants check distinct measurement tabs without recentering, bottom-pane switching, independent peer state, SPA switching between isolated missions, and reload lifetime. The shared mission document is unchanged.

## MEASURE-003: Profile known terrain and slope

**P0 · Mapped**

Action: Draw a path across a golden DEM with known samples, breaks and no-data; compare displayed profile.

Expected: Distance/elevation/ascent/descent/slope use the correct units and segment boundaries; gaps do not invent bridged terrain.

Playwright: [src/tests/playwright/behavior/terrainDem90.spec.ts:180](../../../src/tests/playwright/behavior/terrainDem90.spec.ts#L180) — golden terrain samples and a no-data break match the displayed segmented profile (chromium).

Evidence boundary: Writes a deterministic GeoTIFF with exact elevation and no-data cells, verifies the real terrain service profile against known samples/slopes and independently calculated ascent/descent, then checks the UI terrain profile, no-data gap, segment distances, hover values and slope ramp. The UI gap regression failed before the measurement graph was changed to split at the service no-data sentinel.

## MEASURE-004: Profile stale response ordering

**P0 · Mapped**

Action: Rapidly edit a path and switch mission while older terrain responses are delayed.

Expected: Only the newest request for the current mission/entity can update its profile; canceled/deleted geometry is not resurrected.

Playwright: [src/tests/playwright/behavior/measurementTerrain90.spec.ts:431](../../../src/tests/playwright/behavior/measurementTerrain90.spec.ts#L431) — older terrain responses cannot replace a newer edited profile or cross a mission switch (chromium).

Evidence boundary: Delays and releases an older profile after a newer edit, removes a measurement while its profile request is pending, then switches missions before a delayed response completes; asserts stale profiles and deleted geometry stay absent.

## MEASURE-005: Profile unavailable and malformed inputs

**P1 · Mapped**

Action: Request profiles with absent DEM, invalid coordinates and over-limit samples; inject a worker-unavailable HTTP 503 and a subsequent successful response at the browser boundary.

Expected: The API rejects malformed/unavailable inputs; a worker-unavailable response shows a recoverable profile state while measurement geometry, distance and bearing remain usable, and a successful request clears the error without changing mission data.

Playwright: [src/tests/playwright/behavior/geodesyTerrain90.spec.ts:247](../../../src/tests/playwright/behavior/geodesyTerrain90.spec.ts#L247) — terrain profile errors retain a usable measurement and recover after the worker responds (chromium).

Evidence boundary: Reviewed 2026-10-25 as an API-validation and browser response-handling contract. Real API validation errors and deterministic intercepted 503/success responses establish it; inducing a worker-pool outage is not required for this row. Real successful terrain sampling is covered by the other measurement scenarios.

## MEASURE-006: Path grade versus terrain slope display

**P0 · Mapped**

Fixture: Golden DEM/path with positive/negative grades and terrain slopes on and just beyond 2, 4, 8, 12, 16 and 20 degree boundaries.

Action: Display a known terrain profile with differing uphill/downhill path grade and ground slope; inspect both rendered bands and values.

Expected: Path Grade and Terrain Slope remain distinct quantities in absolute degrees; signed path grades use magnitude for color and exact boundary values use the intended inclusive upper classes.

Playwright: [src/tests/playwright/behavior/measurementTerrain90.spec.ts:360](../../../src/tests/playwright/behavior/measurementTerrain90.spec.ts#L360) — signed path grades stay distinct from terrain slope at inclusive color boundaries (chromium).

Evidence boundary: Uses deterministic profile values to verify path-grade and terrain-slope hover values diverge for uphill and downhill segments, signed path grades use magnitude for the rendered class, and the terrain band honors each inclusive threshold and just-over value from 2° through 20°.

## MEASURE-007: Slope gaps and colorblind rendering parity

**P1 · Mapped**

Fixture: Known profile with null samples, disconnected intervals and valid shallow/steep sections plus representative slope raster.

Action: Render null sample intervals and zero-length/broken segments; toggle standard/colorblind modes and compare map/graph/key.

Expected: No-data intervals stay transparent without bridging; standard and seven-class colorblind ramps follow their documented graph/raster shallow-slope treatment, and hazards above 20 degrees keep the intended class.

Playwright: [src/tests/playwright/behavior/terrainDem90.spec.ts:180](../../../src/tests/playwright/behavior/terrainDem90.spec.ts#L180) — golden terrain samples and a no-data break match the displayed segmented profile (chromium).

Playwright: [src/tests/playwright/behavior/measurementTerrain90.spec.ts:296](../../../src/tests/playwright/behavior/measurementTerrain90.spec.ts#L296) — known segmented terrain profile drives distance and slope display without changing the mission (chromium).

Playwright: [src/tests/playwright/behavior/measurementTerrain90.spec.ts:360](../../../src/tests/playwright/behavior/measurementTerrain90.spec.ts#L360) — signed path grades stay distinct from terrain slope at inclusive color boundaries (chromium).

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:795](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L795) — slope GeoTIFF preserves transparent shallow/no-data cells and the shared >20° hazard color (chromium, firefox, webkit).

Evidence boundary: Existing terrain graph coverage asserts segmented no-data gaps, shallow classes and hazard/key boundaries; the known synthetic slope GeoTIFF adds rendered map pixels for transparent shallow and no-data cells plus the shared middle and >20° hazard colors, with layer visibility confirming the transparent underlay.

## MEASURE-008: Slope key dialog and shared preference

**P1 · Mapped**

Fixture: Loaded real terrain profile with both slope bands and the actual shared color-mode controls.

Action: Open Key by keyboard; inspect both example rows; toggle Colorblind, close with Escape/backdrop and revisit a profile.

Expected: The named dialog explains Path Grade versus Terrain Slope and every active range; aria-pressed and shared graph/legend mode agree, with usable focus and dismissal.

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:149](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L149) — real DEM slope key exposes ranges, shared graph colors and keyboard focus with Escape dismissal (chromium).

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:149](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L149) — real DEM slope key exposes ranges, shared graph colors and keyboard focus with backdrop dismissal (chromium).

Evidence boundary: The real Apollo14 DEM/worker establishes a golden elevation and loads a measurement profile. Keyboard-opened named Key dialog exposes both 24-sample example bands, explanations and all standard/colorblind ranges; graph pixels and shared mode change, Escape/backdrop restore focus, and revisiting preserves mode.

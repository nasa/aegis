# Measurements and terrain profiles

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Local measurements and saved traverse/walkback paths crossing known DEM values and no-data cells.

Source: [src/store/thunk/thunkMeasurement.ts](../../../src/store/thunk/thunkMeasurement.ts), [src/server/express/routes/terrainProfile.ts](../../../src/server/express/routes/terrainProfile.ts), [src/utils/paperSlope.ts](../../../src/utils/paperSlope.ts), [src/components/interface/slope-legend.tsx](../../../src/components/interface/slope-legend.tsx).

Scenario mapping: **2/8 (25%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/measurement_thunk.test.ts](../../../src/tests/vitest/store/thunks/measurement_thunk.test.ts), [src/tests/vitest/express/terrainProfile.test.ts](../../../src/tests/vitest/express/terrainProfile.test.ts), [src/tests/vitest/server/terrain/calculateTerrainSlope.golden.test.ts](../../../src/tests/vitest/server/terrain/calculateTerrainSlope.golden.test.ts), [src/tests/vitest-browser/SlopeLegend.browser.test.tsx](../../../src/tests/vitest-browser/SlopeLegend.browser.test.tsx), [src/tests/vitest-browser/PaperSlope.browser.test.ts](../../../src/tests/vitest-browser/PaperSlope.browser.test.ts).

## MEASURE-001: Measurement create edit and cancel

**P1 · Gap**

Action: Create a measurement, add/drag/remove vertices, finish, cancel a second edit and delete it.

Expected: Known distances/bearings update; Cancel restores the prior local path and unrelated mission data never changes.

## MEASURE-002: Measurement local state and navigation

**P1 · Mapped**

Action: Change measurement tabs and bottom panes, switch mission and reload.

Expected: Selection does not spuriously recenter the map and local-only measurements obey their explicit lifetime.

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:54](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L54) — temporary measurement tabs preserve the map view and stay local through navigation at zoom 17 (chromium).

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:54](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L54) — temporary measurement tabs preserve the map view and stay local through navigation at zoom 19 (chromium).

Evidence boundary: Two zoom variants check distinct measurement tabs without recentering, bottom-pane switching, independent peer state, SPA switching between isolated missions, and reload lifetime. The shared mission document is unchanged.

## MEASURE-003: Profile known terrain and slope

**P0 · Gap**

Action: Draw a path across a golden DEM with known samples, breaks and no-data; compare displayed profile.

Expected: Distance/elevation/ascent/descent/slope use the correct units and segment boundaries; gaps do not invent bridged terrain.

## MEASURE-004: Profile stale response ordering

**P0 · Gap**

Action: Rapidly edit a path and switch mission while older terrain responses are delayed.

Expected: Only the newest request for the current mission/entity can update its profile; canceled/deleted geometry is not resurrected.

## MEASURE-005: Profile unavailable and malformed inputs

**P1 · Gap**

Action: Use absent DEM, unavailable worker, invalid coordinates and over-limit sample requests.

Expected: Failure states are visible and recoverable; saved path and previous valid data stay coherent.

## MEASURE-006: Path grade versus terrain slope display

**P0 · Gap**

Fixture: Golden DEM/path with positive/negative grades and terrain slopes on and just beyond 2, 4, 8, 12, 16 and 20 degree boundaries.

Action: Display a known terrain profile with differing uphill/downhill path grade and ground slope; inspect both rendered bands and values.

Expected: Path Grade and Terrain Slope remain distinct quantities in absolute degrees; signed path grades use magnitude for color and exact boundary values use the intended inclusive upper classes.

## MEASURE-007: Slope gaps and colorblind rendering parity

**P1 · Gap**

Fixture: Known profile with null samples, disconnected intervals and valid shallow/steep sections plus representative slope raster.

Action: Render null sample intervals and zero-length/broken segments; toggle standard/colorblind modes and compare map/graph/key.

Expected: No-data intervals stay transparent without bridging; standard and seven-class colorblind ramps follow their documented graph/raster shallow-slope treatment, and hazards above 20 degrees keep the intended class.

## MEASURE-008: Slope key dialog and shared preference

**P1 · Mapped**

Fixture: Loaded real terrain profile with both slope bands and the actual shared color-mode controls.

Action: Open Key by keyboard; inspect both example rows; toggle Colorblind, close with Escape/backdrop and revisit a profile.

Expected: The named dialog explains Path Grade versus Terrain Slope and every active range; aria-pressed and shared graph/legend mode agree, with usable focus and dismissal.

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:149](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L149) — real DEM slope key exposes ranges, shared graph colors and keyboard focus with Escape dismissal (chromium).

Playwright: [src/tests/playwright/behavior/measurementLifecycle.spec.ts:149](../../../src/tests/playwright/behavior/measurementLifecycle.spec.ts#L149) — real DEM slope key exposes ranges, shared graph colors and keyboard focus with backdrop dismissal (chromium).

Evidence boundary: The real Apollo14 DEM/worker establishes a golden elevation and loads a measurement profile. Keyboard-opened named Key dialog exposes both 24-sample example bands, explanations and all standard/colorblind ranges; graph pixels and shared mode change, Escape/backdrop restore focus, and revisiting preserves mode.

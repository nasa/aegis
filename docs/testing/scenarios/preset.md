# Presets, layers and GIS display

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Mission with two presets, folder ownership, grid/circle definitions and representative raster/vector/time-aware assets.

Source: [src/components/panes/preset/preset-right.tsx](../../../src/components/panes/preset/preset-right.tsx), [src/operations/apply/apply-mission-preset.ts](../../../src/operations/apply/apply-mission-preset.ts), [src/components/interface/map/behaviors/TileLayers.tsx](../../../src/components/interface/map/behaviors/TileLayers.tsx), [src/components/panes/preset/preset-right-azimuth.tsx](../../../src/components/panes/preset/preset-right-azimuth.tsx), [src/components/interface/map/hooks/useSunEarthAzimuths.ts](../../../src/components/interface/map/hooks/useSunEarthAzimuths.ts).

Scenario mapping: **2/13 (15.4%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest-browser/PresetLayers.browser.test.tsx](../../../src/tests/vitest-browser/PresetLayers.browser.test.tsx), [src/tests/vitest-browser/PresetAzimuth.browser.test.tsx](../../../src/tests/vitest-browser/PresetAzimuth.browser.test.tsx), [src/tests/vitest/map/layerFactory.test.ts](../../../src/tests/vitest/map/layerFactory.test.ts), [src/tests/vitest/utils/lunarSky.test.ts](../../../src/tests/vitest/utils/lunarSky.test.ts).

## PRESET-001: Preset lifecycle and defaults

**P1 · Mapped**

Action: Create, rename, duplicate and delete presets; set default; cancel deletion; reload.

Expected: Copies are independent and not default; deleting selected preset returns to the correct default without orphan folder references.

Playwright: [src/tests/playwright/behavior/presetLifecycle.spec.ts:55](../../../src/tests/playwright/behavior/presetLifecycle.spec.ts#L55) — presets create, rename, duplicate independently, delete safely, and return to the persisted default (chromium).

Evidence boundary: Isolated UI creation/rename, independent copied sun styling, default changes, canceled/confirmed selected deletion and default fallback, folder-reference cleanup and reload replace the narrower legacy mapping. Duplicates are explicitly nondefault.

## PRESET-002: Preset view versus saved draft

**P0 · Gap**

Action: Change layers/styles/circles in a draft; Save, Cancel and switch preset; observe a peer.

Expected: Local preview and shared saved state remain distinct; Cancel restores saved values and Save reaches persistence/peer.

## PRESET-003: Layer visibility order opacity and blend

**P1 · Gap**

Action: Toggle and reorder overlapping layers; vary opacity/blend; save and reload.

Expected: The rendered stack, saved order and style match expected known pixels and remain scoped to the preset.

## PRESET-004: Raster source and projection matrix

**P0 · Gap**

Action: Render TMS/XYZ, COG, GeoJSON and PMTiles under supported mission projections.

Expected: Known geographic features align, tile orientation/resolutions are correct and no source silently disappears.

## PRESET-005: Vector and contour style variants

**P1 · Gap**

Action: Change line/fill/point/contour styles and label configuration at several zooms.

Expected: The saved supported styles affect the intended features with correct legends and no stale style cache.

## PRESET-006: Time-aware layer selection

**P0 · Gap**

Action: Scrub time before/at/after slice boundaries with zero, one and many slices; switch EVA/REX.

Expected: Correct source slice follows selected scope/time and no stale imagery remains after navigation.

## PRESET-007: Grid styles labels and CRS variants

**P1 · Gap**

Action: Enable grid/labels; change spacing/styles; compare dynamic LGRS and fixed grids on editor/dashboard.

Expected: Known grid intersections and labels match the mission CRS and displayed units; minimap spacing follows its contract.

## PRESET-008: Preset lander circles and sun directions

**P1 · Gap**

Action: Toggle/style lander circles and Sun/Earth/Moon directions at 0/90/359 degrees; save/cancel.

Expected: Radius is in metres; compass geometry/labels and checkbox states agree across editor/dashboard and saved/local boundaries.

## PRESET-009: Missing invalid and slow map assets

**P1 · Gap**

Action: Return missing/corrupt tiles, COG metadata or PMTiles ranges and recover them.

Expected: Failure does not blank unrelated content or leave a stuck load; valid assets resume rendering coherently.

## PRESET-010: Preset permissions and shared editing

**P0 · Gap**

Action: Create/duplicate/style/delete as viewer/editor/admin and concurrently edit presets from two clients.

Expected: Each control enforces its declared permission/mode rule and clients converge without lost unrelated settings.

## PRESET-011: Calculated celestial directions and manual restoration

**P0 · Mapped**

Fixture: Located lunar mission with fixed UTC, known lander elevation/radius, independently known true azimuths and non-north-up custom CRS.

Action: Enable Calculate using EVA date and lander location; change date/lander/projection; switch back to manual and reload.

Expected: Projected map-up Sun/Earth directions match an independent astronomy/projection oracle; panel and map use the same values, and saved manual angles survive calculated mode.

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:51](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L51) — calculated celestial directions follow independent SPICE values and Mercator map north while manual values survive mode changes (chromium).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:51](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L51) — calculated celestial directions follow independent SPICE values and polar map north while manual values survive mode changes (chromium).

Evidence boundary: The checked-in SPICE reference corpus supplies independent site/date values. South-polar grid convergence uses analytic true-bearing + longitude, Mercator preserves true bearing. Tests observe actual icon positions and rounded labels under date/location updates, calculate/manual UI toggles and reload without overwriting saved manual angles.

## PRESET-012: Celestial date source and fallback warnings

**P1 · Partial**

Fixture: Two EVAs with distinct times, a historical and active REX, dated/undated layer and saved manual angles.

Action: Select planned/historical/running EVA time, preset preview and layer fallback; remove date/lander or supply an unresolved projection.

Expected: Date/source/status labels identify the actual source; missing/invalid date, location or projection warns and uses saved manual directions; an undated selected EVA warning is not hidden by a layer date.

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:188](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L188) — planned, historical, running, layer and preview dates identify their source and invalid prerequisites retain manual directions (chromium).

Evidence boundary: Planned/historical/running EVA date labels, layer fallback, preset preview, absent date/lander and unresolved projection warn and preserve manual values. The selected-undated-EVA warning remains visible during layer/preview fallback. Invalid date numeric/string inputs are not covered; retain partial status.

## PRESET-013: Celestial controls debounce and accessibility

**P1 · Gap**

Fixture: Two distinct presets with different manual angles, editor/viewer sessions and narrow viewport.

Action: Drag manual angles, switch preset or leave before debounce fires; toggle calculated mode, indicator visibility and Edit; focus source info by keyboard.

Expected: The final pending angle writes to its original preset exactly once, mode/permission gates hold, hidden indicators suppress unneeded source controls and source/date explanations remain accessible without overflow.

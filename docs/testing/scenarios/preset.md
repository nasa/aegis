# Presets, layers and GIS display

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Mission with two presets, folder ownership, grid/circle definitions and representative raster/vector/time-aware assets.

Source: [src/components/panes/preset/preset-right.tsx](../../../src/components/panes/preset/preset-right.tsx), [src/operations/apply/apply-mission-preset.ts](../../../src/operations/apply/apply-mission-preset.ts), [src/components/interface/map/behaviors/TileLayers.tsx](../../../src/components/interface/map/behaviors/TileLayers.tsx), [src/components/panes/preset/preset-right-azimuth.tsx](../../../src/components/panes/preset/preset-right-azimuth.tsx), [src/components/interface/map/hooks/useSunEarthAzimuths.ts](../../../src/components/interface/map/hooks/useSunEarthAzimuths.ts).

Scenario mapping: **13/13 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest-browser/PresetLayers.browser.test.tsx](../../../src/tests/vitest-browser/PresetLayers.browser.test.tsx), [src/tests/vitest-browser/PresetAzimuth.browser.test.tsx](../../../src/tests/vitest-browser/PresetAzimuth.browser.test.tsx), [src/tests/vitest/map/layerFactory.test.ts](../../../src/tests/vitest/map/layerFactory.test.ts), [src/tests/vitest/utils/lunarSky.test.ts](../../../src/tests/vitest/utils/lunarSky.test.ts).

## PRESET-001: Preset lifecycle and defaults

**P1 · Mapped**

Action: Create, rename, duplicate and delete presets; set default; cancel deletion; reload.

Expected: Copies are independent and not default; deleting selected preset returns to the correct default without orphan folder references.

Playwright: [src/tests/playwright/behavior/presetLifecycle.spec.ts:55](../../../src/tests/playwright/behavior/presetLifecycle.spec.ts#L55) — presets create, rename, duplicate independently, delete safely, and return to the persisted default (chromium).

Evidence boundary: Isolated UI creation/rename, independent copied sun styling, default changes, canceled/confirmed selected deletion and default fallback, folder-reference cleanup and reload replace the narrower legacy mapping. Duplicates are explicitly nondefault.

## PRESET-002: Preset drafts and immediate shared controls

**P0 · Mapped**

Action: Edit the SunDegrees draft with Save/Cancel; change layer opacity/visibility and circle visibility using their immediate controls; switch preset and observe a peer and reload.

Expected: SunDegrees stays local until Save and Cancel retains the saved value. Layer and circle controls persist immediately to the selected preset and peer; switching presets and reload preserve the distinct saved settings.

Playwright: [src/tests/playwright/behavior/presetEditing90.spec.ts:19](../../../src/tests/playwright/behavior/presetEditing90.spec.ts#L19) — preset edits keep an unsaved value local until Save, Cancel restores it, and saved style and circle changes reach a peer (chromium).

Evidence boundary: Reviewed 2026-10-25 against the existing controls and assertions. Save/Cancel applies to the SunDegrees field draft; layer and circle controls write immediately. The previous catalog incorrectly required a shared draft transaction across these controls.

## PRESET-003: Layer visibility order opacity and blend

**P1 · Mapped**

Action: Toggle and reorder overlapping layers; vary opacity/blend; save and reload.

Expected: The rendered stack, saved order and style match expected known pixels and remain scoped to the preset.

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:115](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L115) — overlapping preset rasters render the saved UI order, opacity and blend pixel after reload (chromium, firefox, webkit).

Evidence boundary: Uses known red and green overlapping tile pixels to assert the initial saved stack, a real UI opacity change and difference blend pixel, a real UI reorder pixel, persistence after reload, and independent style/order state in a second preset.

## PRESET-004: Raster source and projection matrix

**P0 · Mapped**

Action: Render TMS/XYZ, COG, GeoJSON and PMTiles fixtures using named supported source/projection pairs for Earth and lunar missions.

Expected: Known geographic features align, tile orientation/resolutions are correct and no source silently disappears.

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:270](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L270) — Earth Web Mercator TMS requests invert Y and render the declared tile at the known map location (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:346](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L346) — Earth Web Mercator XYZ places its known tile feature at the declared coordinate and resolution (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:513](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L513) — Earth Web Mercator PMTiles archive exposes its known center feature (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:612](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L612) — lunar south-polar stereographic GeoJSON places a known lunar feature near the lander (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay90.spec.ts:795](../../../src/tests/playwright/behavior/rasterDisplay90.spec.ts#L795) — slope GeoTIFF preserves transparent shallow/no-data cells and the shared >20° hazard color (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:188](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L188) — planned, historical, running, layer and preview dates identify their source and invalid prerequisites retain manual directions (chromium).

Evidence boundary: Named Earth TMS/XYZ/PMTiles and lunar GeoJSON/GeoTIFF fixtures assert known content, projected feature placement, XYZ tile coordinate and resolution, and TMS Y orientation.

## PRESET-005: Vector and contour style variants

**P1 · Mapped**

Action: Change line/fill/point/contour styles and label configuration at several zooms.

Expected: The saved supported styles affect the intended features with correct legends and no stale style cache.

Playwright: [src/tests/playwright/behavior/layerStylesAssets90.spec.ts:254](../../../src/tests/playwright/behavior/layerStylesAssets90.spec.ts#L254) — line, fill, point and contour labels use saved styles, legends and zoom thresholds (chromium, firefox, webkit).

Evidence boundary: Loads a small deterministic GeoJSON with line, polygon, and point geometries and a metre legend. Changes supported weight, fill-opacity and label-min-zoom controls in the UI; checks independent OpenLayers stroke/fill/symbol/label values at two zooms, persisted legend content and reload, and distinct saved styles after switching between presets to detect stale style-cache state.

## PRESET-006: Time-aware layer selection

**P0 · Mapped**

Action: Scrub time before/at/after slice boundaries with zero, one and many slices; switch EVA/REX.

Expected: Correct source slice follows selected scope/time and no stale imagery remains after navigation.

Playwright: [src/tests/playwright/behavior/presetTimeCircles90.spec.ts:182](../../../src/tests/playwright/behavior/presetTimeCircles90.spec.ts#L182) — time slices refresh at inclusive boundaries across EVA and REX scopes with zero and one-slice sources (chromium).

Evidence boundary: Uses deterministic local tile responses with distinguishable pixels for a static source, a single dated source, and three dated slices. Selects EVA and two REX time scopes, verifies expected _resolvedPath values and rendered pixels at slice boundaries, verifies imagery is removed after the final bound, and confirms the layer controls persisted.

## PRESET-007: Grid styles labels and CRS variants

**P1 · Mapped**

Action: Enable grid/labels; change spacing/styles; compare dynamic LGRS and fixed grids on editor/dashboard.

Expected: Known grid intersections and labels match the mission CRS and displayed units; minimap spacing follows its contract.

Playwright: [src/tests/playwright/behavior/gridCoordinates90.spec.ts:159](../../../src/tests/playwright/behavior/gridCoordinates90.spec.ts#L159) — fixed-grid visibility, labels, style and preset scope match known CRS intersections (chromium).

Playwright: [src/tests/playwright/behavior/dashboardBridge90.spec.ts:90](../../../src/tests/playwright/behavior/dashboardBridge90.spec.ts#L90) — dashboard minimap bounds, arrows, scale, grid spacing and execution stay bridged (chromium).

Evidence boundary: The fixed-grid editor test enables grid and label visibility, checks a known label at its projected intersection with text style/halo, changes opacity through the UI, switches presets, and reloads to verify saved state. The dashboard support test covers dynamically generated LGRS, actual grid features and fixed 1km spacing inherited by the minimap; the coordinate test independently verifies lunar LGRS labels.

## PRESET-008: Preset lander circles and sun directions

**P1 · Mapped**

Action: Toggle/style lander circles and Sun/Earth/Moon directions at 0/90/359 degrees; save/cancel.

Expected: Radius is in metres; compass geometry/labels and checkbox states agree across editor/dashboard and saved/local boundaries.

Playwright: [src/tests/playwright/behavior/presetTimeCircles90.spec.ts:316](../../../src/tests/playwright/behavior/presetTimeCircles90.spec.ts#L316) — lander circle uses the saved metre radius in the editor and dashboard (chromium).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:139](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L139) — manual celestial drafts save and cancel without changing unrelated compass settings (chromium).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:51](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L51) — calculated celestial directions follow independent SPICE values and Mercator map north while manual values survive mode changes (chromium).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:51](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L51) — calculated celestial directions follow independent SPICE values and polar map north while manual values survive mode changes (chromium).

Playwright: [src/tests/playwright/behavior/presetEditing90.spec.ts:19](../../../src/tests/playwright/behavior/presetEditing90.spec.ts#L19) — preset edits keep an unsaved value local until Save, Cancel restores it, and saved style and circle changes reach a peer (chromium).

Evidence boundary: The new real UI test checks a known 750 m lander radius independently from EPSG:3857 ring coordinates before and after reload, verifies visibility and style persistence, and checks the same radius in the dashboard. Executed celestial coverage verifies compass icon geometry and degree labels against known manual 0°, 90° and 359° values, manual Save/Cancel boundaries, independent SPICE direction values with Mercator and polar north, and preset peer persistence.

## PRESET-009: Missing invalid and slow map assets

**P1 · Mapped**

Action: Return missing/corrupt tiles, COG metadata or PMTiles ranges and recover them.

Expected: Failure does not blank unrelated content or leave a stuck load; valid assets resume rendering coherently.

Playwright: [src/tests/playwright/behavior/layerStylesAssets90.spec.ts:378](../../../src/tests/playwright/behavior/layerStylesAssets90.spec.ts#L378) — failed tiles preserve healthy content, a delayed prior-preset tile stays isolated, and a recovered asset renders (chromium, firefox, webkit).

Evidence boundary: Controlled tile requests return 404, corrupt PNG bytes, a delayed valid tile and a later recovered tile. Known rendered pixels verify healthy content remains visible under failures, the delayed old-preset response cannot affect the selected detail preset, and a corrected valid source renders after returning to the overview.

## PRESET-010: Preset permissions and shared editing

**P0 · Mapped**

Action: Create/duplicate/style/delete as viewer/editor/admin and concurrently edit presets from two clients.

Expected: Each control enforces its declared permission/mode rule and clients converge without lost unrelated settings.

Playwright: [src/tests/playwright/behavior/presetPermissions90.spec.ts:77](../../../src/tests/playwright/behavior/presetPermissions90.spec.ts#L77) — viewer access stays local while editor and admin preset edits converge across peers (chromium).

Playwright: [src/tests/playwright/behavior/presetEditing90.spec.ts:19](../../../src/tests/playwright/behavior/presetEditing90.spec.ts#L19) — preset edits keep an unsaved value local until Save, Cancel restores it, and saved style and circle changes reach a peer (chromium).

Evidence boundary: Disposable viewer, mission editor, and application-admin-with-mission-edit-grant accounts open the real mission UI. Viewer local preset selection and read-only layer viewing stay available with no edit toggle, CRUD buttons, title editor, style controls, or shared-data changes. The editor sees the same UI gates until global Edit is enabled, then creates, duplicates, styles, and deletes a preset. The granted admin can also create/delete. Two live editing clients open separate drafts on the same preset (sun azimuth and description) and save them together; both values, the independently edited layer opacity, and the other preset survive peer observation, authoritative checks, and reload. The supporting preset test covers draft cancellation and peer style/circle propagation. No raw transport revocation behavior is claimed.

## PRESET-011: Calculated celestial directions and manual restoration

**P0 · Mapped**

Fixture: Located lunar mission with fixed UTC, known lander elevation/radius, independently known true azimuths and non-north-up custom CRS.

Action: Enable Calculate using EVA date and lander location; change date/lander/projection; switch back to manual and reload.

Expected: Projected map-up Sun/Earth directions match an independent astronomy/projection oracle; panel and map use the same values, and saved manual angles survive calculated mode.

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:51](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L51) — calculated celestial directions follow independent SPICE values and Mercator map north while manual values survive mode changes (chromium).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:51](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L51) — calculated celestial directions follow independent SPICE values and polar map north while manual values survive mode changes (chromium).

Evidence boundary: The checked-in SPICE reference corpus supplies independent site/date values. South-polar grid convergence uses analytic true-bearing + longitude, Mercator preserves true bearing. Tests observe actual icon positions and rounded labels under date/location updates, calculate/manual UI toggles and reload without overwriting saved manual angles.

## PRESET-012: Celestial date source and fallback warnings

**P1 · Mapped**

Fixture: Two EVAs with distinct times, a historical and active REX, dated/undated layer and saved manual angles.

Action: Select planned/historical/running EVA time, preset preview and layer fallback; remove date/lander or supply an unresolved projection.

Expected: Date/source/status labels identify the actual source; missing/invalid date, location or projection warns and uses saved manual directions; an undated selected EVA warning is not hidden by a layer date.

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:188](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L188) — planned, historical, running, layer and preview dates identify their source and invalid prerequisites retain manual directions (chromium).

Playwright: [src/tests/playwright/behavior/celestialControls90.spec.ts:48](../../../src/tests/playwright/behavior/celestialControls90.spec.ts#L48) — invalid selected EVA dates retain the EVA warning through layer and preview fallback and preserve manual angles (chromium).

Evidence boundary: Together cover planned/historical/running source, layer and preview status/attribution, absent and invalid numeric/string EVA dates, invalid lander and projection, warning preservation through layer/preview fallback, and restoration of saved manual directions when no valid source remains.

## PRESET-013: Celestial controls debounce and accessibility

**P1 · Mapped**

Fixture: Two distinct presets with different manual angles, editor/viewer sessions and narrow viewport.

Action: Drag manual angles, switch preset or leave before debounce fires; toggle calculated mode, indicator visibility and Edit; focus source info by keyboard.

Expected: The final pending angle writes to its original preset exactly once, mode/permission gates hold, hidden indicators suppress unneeded source controls and source/date explanations remain accessible without overflow.

Playwright: [src/tests/playwright/behavior/celestialControls90.spec.ts:161](../../../src/tests/playwright/behavior/celestialControls90.spec.ts#L161) — manual angle drags flush to their original preset on switch, and viewer controls and source info stay usable (chromium).

Evidence boundary: A real circular-slider drag is switched to another preset before the debounce interval; the final value is saved to the original preset, unrelated manual angle and other preset remain unchanged. Calculated/manual toggle, Edit-off and viewer permission gates, hidden indicator source-button suppression, keyboard focus/activation, accessible source description, and horizontal fit at 360px are asserted.

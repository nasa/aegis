# Accessibility, browser compatibility and resilience

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Keyboard-only, reduced-motion and narrow/wide viewport sessions; Chromium full suite and Firefox/WebKit smoke configurations.

Source: [src/components/interface](../../../src/components/interface), [src/tests/playwright/playwright.config.ts](../../../src/tests/playwright/playwright.config.ts).

Scenario mapping: **5/5 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

## ACCESS-001: Keyboard and dialog focus

**P1 · Mapped**

Action: Navigate controls by keyboard, open/close validation and confirmation dialogs and restore focus.

Expected: Controls have usable labels, focus remains visible/contained as appropriate and Save/Cancel operate without a mouse.

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:42](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L42) — keyboard edit focuses the dialog field and restores focus after dismissal (chromium, firefox, webkit).

## ACCESS-002: Responsive editor and dashboard

**P1 · Mapped**

Action: Use narrow/wide and high-DPI viewports with long labels, expanded lists and reports.

Expected: Essential controls, modal actions and map/timeline content remain reachable without clipped inaccessible UI.

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:91](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L91) — editor controls and map remain reachable at narrow and wide viewports (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:205](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L205) — dashboard map and minimap stay visible and within narrow and wide viewports (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:131](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L131) — long labels, report text and timeline canvas stay inside the narrow editor viewport (chromium, firefox, webkit).

Evidence boundary: High-DPI narrow/wide editor and dashboard viewports check map/control bounds, an editor dialog, an expanded EVA list and the dashboard clock. A long station label must wrap within its list row, and the report panel and timeline canvas are checked against the narrow viewport bounds and horizontal overflow.

## ACCESS-003: Cross-browser map and dashboard rendering parity

**P0 · Mapped**

Action: Render the same known Earth/lunar projection, layer, label and dashboard fixtures in Chromium, Firefox and WebKit.

Expected: Known geometry, labels, layering and dashboard/minimap ownership agree across browsers; source membership and visual assertions detect absent or misplaced content.

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:234](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L234) — known station, POI and traverse labels render in the editor map (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:308](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L308) — dashboard and minimap own the active execution and share its feature labels (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay.spec.ts:115](../../../src/tests/playwright/behavior/rasterDisplay.spec.ts#L115) — overlapping preset rasters render the saved UI order, opacity and blend pixel after reload (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay.spec.ts:270](../../../src/tests/playwright/behavior/rasterDisplay.spec.ts#L270) — Earth Web Mercator TMS requests invert Y and render the declared tile at the known map location (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay.spec.ts:513](../../../src/tests/playwright/behavior/rasterDisplay.spec.ts#L513) — Earth Web Mercator PMTiles archive exposes its known center feature (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay.spec.ts:612](../../../src/tests/playwright/behavior/rasterDisplay.spec.ts#L612) — lunar south-polar stereographic GeoJSON places a known lunar feature near the lander (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/rasterDisplay.spec.ts:795](../../../src/tests/playwright/behavior/rasterDisplay.spec.ts#L795) — slope GeoTIFF preserves transparent shallow/no-data cells and the shared >20° hazard color (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/layerStylesAssets.spec.ts:254](../../../src/tests/playwright/behavior/layerStylesAssets.spec.ts#L254) — line, fill, point and contour labels use saved styles, legends and zoom thresholds (chromium, firefox, webkit).

## ACCESS-004: Cross-browser editing and downloads

**P1 · Mapped**

Action: Run representative dialog, drag/path, collaboration and export scenarios in all supported browsers.

Expected: Native input, pointer, canvas and download behavior satisfy the same contracts outside Chromium; smoke alone is insufficient.

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:332](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L332) — keyboard text edit persists and mission export downloads valid JSON (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/actions.spec.ts:59](../../../src/tests/playwright/behavior/actions.spec.ts#L59) — action name and duration validation and Cancel preserve the saved action and totals (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:198](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L198) — dragging an interior vertex then Finished preserves endpoints and the intended path after reload (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/collaborationPresence.spec.ts:19](../../../src/tests/playwright/behavior/collaborationPresence.spec.ts#L19) — distinct editor and viewer accounts share presence and edits, retain independent selections and lose HTTP access after revocation (chromium, firefox, webkit).

Evidence boundary: Selected representative dialog/edit, pointer path, collaborative multi-user and download workflows are assigned to Firefox and WebKit as well as Chromium.

## ACCESS-005: Accessible status and visual distinction

**P1 · Mapped**

Action: Inspect errors, status changes, disabled controls, icons and map legends with keyboard/screen-reader and contrast checks.

Expected: Meaning is available through labels/text as well as color; errors and state changes remain understandable.

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:407](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L407) — invalid numeric input exposes a readable error and prevents saving (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/accessibilityCoverage.spec.ts:375](../../../src/tests/playwright/behavior/accessibilityCoverage.spec.ts#L375) — report status is named and keyboard-operable when its warning icon changes (chromium, firefox, webkit).

Playwright: [src/tests/playwright/behavior/celestialPresetCoverage.spec.ts:188](../../../src/tests/playwright/behavior/celestialPresetCoverage.spec.ts#L188) — planned, historical, running, layer and preview dates identify their source and invalid prerequisites retain manual directions (chromium).

Playwright: [src/tests/playwright/behavior/rasterDisplay.spec.ts:795](../../../src/tests/playwright/behavior/rasterDisplay.spec.ts#L795) — slope GeoTIFF preserves transparent shallow/no-data cells and the shared >20° hazard color (chromium, firefox, webkit).

Evidence boundary: Keyboard checks cover readable validation and disabled controls. Report tab status descriptions name warning and clear states while the icon changes, celestial source warnings remain available as descriptions, and the map legend pairs labeled slope meanings with distinct standard and colorblind swatches.

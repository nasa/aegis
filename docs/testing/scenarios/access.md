# Accessibility, browser compatibility and resilience

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Keyboard-only, reduced-motion and narrow/wide viewport sessions; Chromium full suite and Firefox/WebKit smoke configurations.

Source: [src/components/interface](../../../src/components/interface), [src/tests/playwright/playwright.config.ts](../../../src/tests/playwright/playwright.config.ts).

Scenario mapping: **0/5 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

## ACCESS-001: Keyboard and dialog focus

**P1 · Gap**

Action: Navigate controls by keyboard, open/close validation and confirmation dialogs and restore focus.

Expected: Controls have usable labels, focus remains visible/contained as appropriate and Save/Cancel operate without a mouse.

## ACCESS-002: Responsive editor and dashboard

**P1 · Gap**

Action: Use narrow/wide and high-DPI viewports with long labels, expanded lists and reports.

Expected: Essential controls, modal actions and map/timeline content remain reachable without clipped inaccessible UI.

## ACCESS-003: Cross-browser map and dashboard rendering parity

**P0 · Partial**

Action: Render the same known Earth/lunar projection, layer, label and dashboard fixtures in Chromium, Firefox and WebKit.

Expected: Known geometry, labels, layering and dashboard/minimap ownership agree across browsers; source membership and visual assertions detect absent or misplaced content.

Playwright: [src/tests/playwright/behavior/smoke.spec.ts:6](../../../src/tests/playwright/behavior/smoke.spec.ts#L6) — an isolated mission exposes its planned EVAs, stations, POIs and map (chromium, firefox, webkit).

Evidence boundary: All four smoke examples are discovered in each browser, but they do not establish projection/layer/label visual parity for the full fixture matrix.

## ACCESS-004: Cross-browser editing and downloads

**P1 · Gap**

Action: Run representative dialog, drag/path, collaboration and export scenarios in all supported browsers.

Expected: Native input, pointer, canvas and download behavior satisfy the same contracts outside Chromium; smoke alone is insufficient.

## ACCESS-005: Accessible status and visual distinction

**P1 · Gap**

Action: Inspect errors, status changes, disabled controls, icons and map legends with keyboard/screen-reader and contrast checks.

Expected: Meaning is available through labels/text as well as color; errors and state changes remain understandable.

# Execution dashboard, follow and minimap

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning/no-execution fixture and active paused execution with known PET, positions and station geometry.

Source: [src/pages/dashboard.tsx](../../../src/pages/dashboard.tsx), [src/components/interface/map/AegisMapDashboard.tsx](../../../src/components/interface/map/AegisMapDashboard.tsx), [src/components/interface/map/AegisMapMinimap.tsx](../../../src/components/interface/map/AegisMapMinimap.tsx).

Scenario mapping: **9/9 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest-browser/map/FollowMode.browser.test.tsx](../../../src/tests/vitest-browser/map/FollowMode.browser.test.tsx), [src/tests/vitest-browser/map/BigMapBoundsBox.browser.test.tsx](../../../src/tests/vitest-browser/map/BigMapBoundsBox.browser.test.tsx).

## DASH-001: the dashboard explicitly reports that no execution is running

**P0 · Mapped**

Action: the dashboard explicitly reports that no execution is running

Expected: Without a running execution the dashboard shows the explicit empty-state message and has no dashboard map or PET clock.

Playwright: [src/tests/playwright/behavior/smoke.spec.ts:55](../../../src/tests/playwright/behavior/smoke.spec.ts#L55) — the dashboard explicitly reports that no execution is running (chromium, firefox, webkit).

## DASH-002: dashboard clock and both maps belong to the active execution

**P0 · Mapped**

Action: dashboard clock and both maps belong to the active execution

Expected: Active dashboard shows PET +00:05:00, one dashboard and one minimap viewport, and the active position age +00:03:00.

Playwright: [src/tests/playwright/behavior/smoke.spec.ts:69](../../../src/tests/playwright/behavior/smoke.spec.ts#L69) — dashboard clock and both maps belong to the active execution (chromium, firefox, webkit).

## DASH-003: dashboard scale-bar changes reach both maps and persist together after reload

**P0 · Mapped**

Action: dashboard scale-bar changes reach both maps and persist together after reload

Expected: Dashboard scale-bar changes affect both maps immediately and survive a shared reload.

Playwright: [src/tests/playwright/behavior/dashboardMap.spec.ts:29](../../../src/tests/playwright/behavior/dashboardMap.spec.ts#L29) — dashboard scale-bar changes reach both maps and persist together after reload (chromium).

## DASH-004: minimap stations and dashboard position age belong solely to the active execution

**P0 · Mapped**

Action: minimap stations and dashboard position age belong solely to the active execution

Expected: Minimap station membership and dashboard position age contain only the active execution, excluding historical Alpha entities.

Playwright: [src/tests/playwright/behavior/dashboardMap.spec.ts:59](../../../src/tests/playwright/behavior/dashboardMap.spec.ts#L59) — minimap stations and dashboard position age belong solely to the active execution (chromium).

## DASH-005: Dashboard timeline and progress

**P0 · Mapped**

Action: Render known allotted/calculated durations, station/traverse/action states and crew percentages; advance/pause PET.

Expected: Timeline scale, blocks, PET/allotted lines, colors, numbering and progress match independent known values.

Playwright: [src/tests/playwright/behavior/dashboardProgress90.spec.ts:7](../../../src/tests/playwright/behavior/dashboardProgress90.spec.ts#L7) — dashboard timeline scales known allotted and calculated work with PET and crew progress (chromium).

Playwright: [src/tests/playwright/behavior/dashboardHandoverCoverage.spec.ts:36](../../../src/tests/playwright/behavior/dashboardHandoverCoverage.spec.ts#L36) — dashboard follows remote execution start, PET pause/resume, stop and REX handover without reload (chromium).

Evidence boundary: The dashboard test uses five known block durations totaling 25 minutes inside a 30-minute allotment, including an EV1 action-derived eight-minute station dwell. It verifies per-block top/height, the 0:00/0:30 scale, 12-minute PET marker/clock, complete and in-progress colors, crew percentages, Maestro numbering/color, and persisted action/station state. The existing handover case advances/pauses PET and verifies stop and REX switching.

## DASH-006: Follow mode latest-position selection

**P0 · Mapped**

Action: Add older/newer positions in different storage order and toggle source/type/station/traverse follow options.

Expected: Dashboard follows the intended source-filtered latest entries; minimap retains its documented bounds/position selection contract.

Playwright: [src/tests/playwright/behavior/dashboardFollowCoverage.spec.ts:54](../../../src/tests/playwright/behavior/dashboardFollowCoverage.spec.ts#L54) — dashboard follows newest source-filtered positions and independently selected active stations and traverses (chromium).

Evidence boundary: Out-of-order stored entries have independent createdAt timestamps and explicit source locations. UI source and station/traverse/type follow toggles assert projected centers; minimap bounds include the documented first stored position and active plan station, with exact active station ownership. Auto-follow off preserves center.

## DASH-007: Follow settings after type changes

**P1 · Mapped**

Action: Disable follow options, edit position types from a peer and remove the final position.

Expected: Options rebuild according to the intended persistence rule; empty lists do not leave stale centering or reset unrelated choices.

Playwright: [src/tests/playwright/behavior/dashboardFollowCoverage.spec.ts:151](../../../src/tests/playwright/behavior/dashboardFollowCoverage.spec.ts#L151) — peer marker-type edits preserve disabled follow choices and deleting the last position leaves no stale recentering (chromium).

Evidence boundary: A peer renames a position type and deletes the final position through real UI. Follow choices remain unchecked and the dashboard center stays fixed; enabling an empty type causes no stale follow, and station follow still works. Failing-before trace demonstrates station/traverse option reset; FollowModeProvider now preserves unrelated choices.

## DASH-008: Minimap bounds and arrow bridge

**P1 · Mapped**

Action: Pan/zoom the big map; toggle traverse arrows/scale/grid; resize and switch active execution.

Expected: Minimap bounds, arrow visibility, scale and grid spacing stay coherent with dashboard context and current execution.

Playwright: [src/tests/playwright/behavior/dashboardBridge90.spec.ts:90](../../../src/tests/playwright/behavior/dashboardBridge90.spec.ts#L90) — dashboard minimap bounds, arrows, scale, grid spacing and execution stay bridged (chromium).

Evidence boundary: Real dashboard/minimap maps and visibility menu: viewport bounds are compared to the minimap bounds polygon after pan, zoom, resize, and a running-REX handover; dashboard grid-spacing selection changes rendered lines on both maps; traverse arrow styles and scale-bar visibility mirror to the minimap; the handover updates active-execution station/traverse features and PET.

## DASH-009: Dashboard live start pause stop and handover

**P0 · Mapped**

Action: Keep dashboard open while another client starts, pauses, resumes, stops and switches REX.

Expected: Identity, PET, timeline, markers and empty states transition coherently through the complete sequence without reload.

Playwright: [src/tests/playwright/behavior/dashboardHandoverCoverage.spec.ts:36](../../../src/tests/playwright/behavior/dashboardHandoverCoverage.spec.ts#L36) — dashboard follows remote execution start, PET pause/resume, stop and REX handover without reload (chromium).

Evidence boundary: Open dashboard moves from empty through remote start, paused/resumed PET, stop/empty and a different execution handover without reload; identity, exact PET and map position scopes agree.

# Application entry and navigation

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Disposable planning mission with two EVAs, shared and unshared stations, a POI, and known relationships.

Source: [src/App.tsx](../../../src/App.tsx), [src/pages/index.tsx](../../../src/pages/index.tsx), [src/pages/mission.tsx](../../../src/pages/mission.tsx), [src/components/interface/_paneTypes.ts](../../../src/components/interface/_paneTypes.ts).

Scenario mapping: **6/9 (66.7%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

## APP-001: an isolated mission exposes its planned EVAs, stations, POIs and map

**P1 · Mapped**

Action: an isolated mission exposes its planned EVAs, stations, POIs and map

Expected: Two named planned EVAs, named stations and the POI are visible in their sections; the editor canvas is visible.

Playwright: [src/tests/playwright/behavior/smoke.spec.ts:6](../../../src/tests/playwright/behavior/smoke.spec.ts#L6) — an isolated mission exposes its planned EVAs, stations, POIs and map (chromium, firefox, webkit).

## APP-002: mission identity and fixture relationships survive a fresh browser load

**P1 · Mapped**

Action: mission identity and fixture relationships survive a fresh browser load

Expected: Reload preserves the exact mission header and EVA sequence; the action still belongs to its seeded station.

Playwright: [src/tests/playwright/behavior/smoke.spec.ts:34](../../../src/tests/playwright/behavior/smoke.spec.ts#L34) — mission identity and fixture relationships survive a fresh browser load (chromium, firefox, webkit).

## APP-003: Mission selector and mission isolation

**P0 · Mapped**

Action: Open home with two accessible and one inaccessible mission; select each permitted mission.

Expected: Only authorized missions appear; each opens its own identity and entities without stale prior-mission content.

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:71](../../../src/tests/playwright/behavior/authEntry.spec.ts#L71) — viewer mission selector lists only granted missions and switches without prior entities (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:71](../../../src/tests/playwright/behavior/authEntry.spec.ts#L71) — editor mission selector lists only granted missions and switches without prior entities (chromium).

Evidence boundary: Distinct nonadmin viewer/editor accounts receive exactly two explicit mission grants and cannot see a third isolated mission. UI selection moves between populated and empty missions without stale entities; an inaccessible direct URL redirects to the permitted selector. Disposable accounts/missions are cleaned up.

## APP-004: Direct links, back and forward

**P1 · Mapped**

Action: Open editor and dashboard directly; navigate home and use browser back/forward.

Expected: The requested mission and page restore without blank views, duplicate maps, or stale selections.

Playwright: [src/tests/playwright/behavior/navigation.spec.ts:5](../../../src/tests/playwright/behavior/navigation.spec.ts#L5) — editor and dashboard direct links restore through home, back and forward without stale maps (chromium).

## APP-005: Unavailable mission handling

**P0 · Gap**

Action: Open nonexistent, deleted and inaccessible mission IDs, including a stale link.

Expected: Show the supported failure or redirect; do not expose another mission or leave an editable stale document.

## APP-006: Pane and tab availability by action version

**P0 · Mapped**

Action: Open explicit v1 and v2 missions; visit every registered pane and right-hand tab.

Expected: v1 STM Viewer and v2 STM Rules/Reports appear only for their version; navigation selects the intended content.

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — mission exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — preset exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — poi exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — station exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — eva exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — traverse exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — rex exposes every intended right-hand tab in v1 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:141](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L141) — legacy STM Viewer owns its fullscreen controls without v2 tabs (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — mission exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — preset exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — poi exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — station exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — eva exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — traverse exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:35](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L35) — rex exposes every intended right-hand tab in v2 (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:157](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L157) — v2 stmRules fullscreen tabs select their own content (chromium).

Playwright: [src/tests/playwright/behavior/versionNavigation.spec.ts:157](../../../src/tests/playwright/behavior/versionNavigation.spec.ts#L157) — v2 reports fullscreen tabs select their own content (chromium).

Evidence boundary: Explicit v1/v2 fixtures visit every registered pane and all mission, preset, POI, station, EVA, traverse and REX right tabs, asserting selected content and version-specific absence. Fullscreen STM/rules/report tabs are covered; navigation leaves the document unchanged.

## APP-007: Layout and local selection persistence

**P2 · Gap**

Action: Resize panes; expand/collapse lists; switch section, mission, and reload.

Expected: Layout and selection follow their documented local persistence boundaries without changing mission data.

## APP-008: Loading and failed hydration

**P0 · Gap**

Action: Delay and fail initial mission/doc requests, then retry.

Expected: Loading does not enable editing before authoritative state is ready; failure is visible and retry recovers.

## APP-009: Version check page recovery

**P0 · Mapped**

Action: Open /versionCheck after a deployed-version or server-epoch change and reload.

Expected: The page explains the required refresh and obtains the current version before editing resumes.

Playwright: [src/tests/playwright/behavior/navigation.spec.ts:33](../../../src/tests/playwright/behavior/navigation.spec.ts#L33) — version check explains a deployment mismatch and refreshes the requested mission with the current version (chromium).

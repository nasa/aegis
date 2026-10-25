# Station lifecycle and properties

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning fixture with a shared station, an unassigned station, child actions, folders and lander copies.

Source: [src/components/panes/station/station-right.tsx](../../../src/components/panes/station/station-right.tsx), [src/operations/apply/apply-station.ts](../../../src/operations/apply/apply-station.ts).

Scenario mapping: **16/16 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/station_thunk.test.ts](../../../src/tests/vitest/store/thunks/station_thunk.test.ts).

## STATION-001: station names save to the mission, update the list, and survive a fresh page

**P1 · Mapped**

Action: station names save to the mission, update the list, and survive a fresh page

Expected: A saved station name appears exactly once, persists after a fresh page, and leaves the other station unchanged.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:20](../../../src/tests/playwright/behavior/planning.spec.ts#L20) — station names save to the mission, update the list, and survive a fresh page (chromium).

## STATION-002: canceling a station rename leaves its name and related traverse names unchanged

**P1 · Mapped**

Action: canceling a station rename leaves its name and related traverse names unchanged

Expected: Cancel preserves the original station and traverse names in persisted data and after a fresh page.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:42](../../../src/tests/playwright/behavior/planning.spec.ts#L42) — canceling a station rename leaves its name and related traverse names unchanged (chromium).

## STATION-003: station name validation rejects empty names without saving

**P1 · Mapped**

Action: station name validation rejects empty names without saving

Expected: An empty name shows Required and cannot replace either saved station name.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:65](../../../src/tests/playwright/behavior/planning.spec.ts#L65) — station name validation rejects empty names without saving (chromium).

## STATION-004: station name validation rejects case-insensitive duplicates without saving

**P1 · Mapped**

Action: station name validation rejects case-insensitive duplicates without saving

Expected: A case-insensitive duplicate shows the uniqueness error and cannot replace either station name.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:65](../../../src/tests/playwright/behavior/planning.spec.ts#L65) — station name validation rejects case-insensitive duplicates without saving (chromium).

## STATION-005: duplicating a station copies its actions with independent identities and editable values

**P1 · Mapped**

Action: duplicating a station copies its actions with independent identities and editable values

Expected: The station copy retains location, POI links and action order with fresh station/action UUIDs and lineage; edits leave the original unchanged and persist.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:88](../../../src/tests/playwright/behavior/planning.spec.ts#L88) — duplicating a station copies its actions with independent identities and editable values (chromium).

## STATION-006: a station shared by planned EVAs cannot be deleted directly

**P1 · Mapped**

Action: a station shared by planned EVAs cannot be deleted directly

Expected: Deleting a station shared by two planned EVAs is refused and the mission remains unchanged.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:138](../../../src/tests/playwright/behavior/planning.spec.ts#L138) — a station shared by planned EVAs cannot be deleted directly (chromium).

## STATION-007: deleting an unassigned station removes its child actions and folder entry while retaining other plans

**P1 · Mapped**

Action: deleting an unassigned station removes its child actions and folder entry while retaining other plans

Expected: Deleting an unassigned station removes its child actions and folder membership while retaining the other plans.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:168](../../../src/tests/playwright/behavior/planning.spec.ts#L168) — deleting an unassigned station removes its child actions and folder entry while retaining other plans (chromium).

## STATION-008: a newly created station can be named, persisted, and deleted without modifying existing stations

**P1 · Mapped**

Action: a newly created station can be named, persisted, and deleted without modifying existing stations

Expected: A new station can be named, saved, reloaded and removed while the existing stations remain unchanged.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:213](../../../src/tests/playwright/behavior/planning.spec.ts#L213) — a newly created station can be named, persisted, and deleted without modifying existing stations (chromium).

## STATION-009: station dwell time saves as minutes and rejects zero without corrupting the saved value

**P1 · Mapped**

Action: station dwell time saves as minutes and rejects zero without corrupting the saved value

Expected: Dwell 37 minutes persists; zero is rejected without corrupting the saved duration.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:350](../../../src/tests/playwright/behavior/planning.spec.ts#L350) — station dwell time saves as minutes and rejects zero without corrupting the saved value (chromium).

## STATION-010: Station rename updates connected traverse names

**P1 · Mapped**

Action: Rename both endpoints of a traverse, singly and from two clients; reload.

Expected: Connected traverse labels use both final endpoint names regardless of edit order.

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:18](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L18) — renaming traverse endpoints Alpha then Bravo from two clients updates every connected label (chromium).

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:18](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L18) — renaming traverse endpoints Bravo then Alpha from two clients updates every connected label (chromium).

Evidence boundary: Both endpoint save orders from two synchronized clients update all adjacent traverse labels; exact geometry, ownership and unrelated entities remain unchanged after reload. This does not establish simultaneous stale-snapshot rename resolution.

## STATION-011: Station delete Cancel and lander protection

**P0 · Mapped**

Action: Cancel deletion of an unassigned station; try direct deletion of egress/ingress copies.

Expected: Cancel preserves children and membership; managed lander copies cannot be deleted independently.

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:97](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L97) — canceling deletion of an unassigned station preserves its actions and folder membership (chromium).

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:146](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L146) — direct deletion of a managed lander egress is rejected without altering the graph (chromium).

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:146](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L146) — direct deletion of a managed lander ingress is rejected without altering the graph (chromium).

Evidence boundary: Cancel preserves the complete unassigned station/action/folder graph. Confirmed direct deletion of either managed lander endpoint is rejected before graph mutation.

## STATION-012: Station location, elevation and lander shortcut

**P0 · Mapped**

Action: Create/move/cancel station location; use Set to Lander; repeat with missing DEM/lander.

Expected: Committed location and elevation are correct; connected paths update and unavailable data is represented without corrupting saved geometry.

Playwright: [src/tests/playwright/behavior/stationGeometry90.spec.ts:195](../../../src/tests/playwright/behavior/stationGeometry90.spec.ts#L195) — station location creation, cancellation, lander shortcut, and missing terrain preserve valid geometry (chromium).

Playwright: [src/tests/playwright/behavior/mapDirectives90.spec.ts:211](../../../src/tests/playwright/behavior/mapDirectives90.spec.ts#L211) — station location can be cancelled, cleared, and recreated from a known map pixel (chromium).

Evidence boundary: Existing golden DEM/grid coverage for station create/move/cancel, Set to Lander and missing data is complemented by UI clear and map-pixel recreation. The clear mutation resets elevation and dependent walkback data, retains connected traverse geometry, and hides station/walkback features; recreated coordinates and persisted map geometry are independently checked.

## STATION-013: Station walkback lifecycle

**P0 · Mapped**

Action: Open a located station with/without walkback; edit its path/rate; cancel/reset and reload.

Expected: Walkback endpoints stay pinned to station/lander and distance, time and profile agree with the saved path.

Playwright: [src/tests/playwright/behavior/stationGeometry90.spec.ts:366](../../../src/tests/playwright/behavior/stationGeometry90.spec.ts#L366) — walkback edit cancel, finish, rate metrics, reset, and reload preserve pinned endpoints (chromium).

Evidence boundary: Opens a located station whose walkback data is independently populated from a direct terrain-profile API response, drags a path vertex and cancels, then edits and saves the path and traverse rate. It checks pinned station/lander endpoints, rendered map geometry, sampled per-segment profiles, independent distance/time metrics, Reset Path, and persisted values after reload. Uses and cleans its test-owned golden DEM/grid fixture.

## STATION-014: Station manual versus calculated dwell

**P0 · Mapped**

Action: Clear manual dwell with known EV1/EV2 and unassigned actions; restore an override.

Expected: Displayed duration follows the intended override precedence and crew warnings without losing action data.

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:184](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L184) — manual station dwell overrides calculated crew time without unassigned actions (chromium).

Playwright: [src/tests/playwright/behavior/stationGraph.spec.ts:184](../../../src/tests/playwright/behavior/stationGraph.spec.ts#L184) — manual station dwell overrides calculated crew time with unassigned actions (chromium).

Evidence boundary: Manual-to-calculated-to-manual UI lifecycle uses independent 10/7/3 minute tasks plus a disabled 90 minute task, with and without unassigned work. Peer sequence duration, warning state, saved action data and reload agree.

## STATION-015: Station proximity circles

**P1 · Mapped**

Action: Toggle/style circles at one station, then inspect another station and a peer.

Expected: Styles and visibility persist for that station only and map radii match definition metres.

Playwright: [src/tests/playwright/behavior/stationCircles.spec.ts:69](../../../src/tests/playwright/behavior/stationCircles.spec.ts#L69) — station circle visibility and style stay local and render the defined metre radius (chromium).

Evidence boundary: One station circle visibility/style is changed with a controlled debounce; the other station remains independent. Peer/reload and independently measured 350m radius/tight center association are checked.

## STATION-016: Station icon description and usage

**P2 · Mapped**

Action: Edit icon/description and inspect EVA usage and linked POI totals.

Expected: Lists, map and info agree; shared station usage remains accurate across plans and execution copies.

Playwright: [src/tests/playwright/behavior/stationMetadataUsage.spec.ts:51](../../../src/tests/playwright/behavior/stationMetadataUsage.spec.ts#L51) — station description and icon agree in list, map, linked POIs and shared EVA usage (chromium).

Evidence boundary: Shared station description Cancel/Save and icon agree with list/map/info, peer and reload. Two planned EVAs share the station while exact execution-owned copies remain unchanged. Linked POI action count/time/mass/use totals are independently known and associations stay intact.

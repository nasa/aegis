# Mission preferences and defaults

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Blank mission with known lander, rates, banner, projection and action-system version.

Source: [src/components/panes/mission/mission-right-prefs.tsx](../../../src/components/panes/mission/mission-right-prefs.tsx), [src/operations/apply/apply-mission.ts](../../../src/operations/apply/apply-mission.ts).

Scenario mapping: **6/6 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/mission_thunk.test.ts](../../../src/tests/vitest/store/thunks/mission_thunk.test.ts).

## CFG-001: Mission preferences save and cancel

**P1 · Mapped**

Action: Rename mission, edit banner and defaults; cancel a second edit; reload and open a peer.

Expected: Exact saved values reach header, consumers, persistence and peer; canceled values never do.

Playwright: [src/tests/playwright/behavior/configuration.spec.ts:21](../../../src/tests/playwright/behavior/configuration.spec.ts#L21) — saved mission preferences reach the header and a peer while canceled edits stay local (chromium).

## CFG-002: Mission preference validation boundaries

**P1 · Mapped**

Action: Try blank required text, maximum/overlong text, fractional/negative/zero/unset rates and durations.

Expected: Each field enforces its actual constraints; invalid Save leaves the previous document and consumers unchanged.

Playwright: [src/tests/playwright/behavior/configuration.spec.ts:80](../../../src/tests/playwright/behavior/configuration.spec.ts#L80) — mission text and numeric validation preserves saved values at rejected boundaries (chromium).

## CFG-003: Default override propagation

**P0 · Mapped**

Action: Change mission traverse/walkback rates and EVA duration with inherited and explicit entity overrides.

Expected: Inherited traverse/walkback rates update; explicit overrides survive; clearing a rate override restores inheritance. The EVA duration default initializes newly created EVAs while existing EVA durations stay unchanged.

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:111](../../../src/tests/playwright/behavior/calculations.spec.ts#L111) — 500 meter travel uses traverse then EVA then mission rate and zero restores inherited calculations (chromium).

Playwright: [src/tests/playwright/behavior/missionDefaults.spec.ts:28](../../../src/tests/playwright/behavior/missionDefaults.spec.ts#L28) — mission walkback defaults update inherited times while station overrides and existing EVA durations stay independent (chromium).

## CFG-004: Lander relocation cascades

**P0 · Mapped**

Fixture: Isolated two-EVA mission using the checked-in Apollo 14 DEM extract copied into its own mission directory; GDAL golden elevation at the destination.

Action: Move the lander with stations, walkbacks and multiple EVA egress/ingress copies; reload and observe a peer.

Expected: Location/elevation, walkback endpoints and affected paths update coherently without moving unrelated stations.

Playwright: [src/tests/playwright/behavior/missionDefaults.spec.ts:99](../../../src/tests/playwright/behavior/missionDefaults.spec.ts#L99) — lander relocation updates every EVA boundary and walkback with real DEM elevation on a peer and after reload (chromium).

## CFG-005: Lander absent and restored

**P1 · Mapped**

Action: Clear/set lander location and open location-dependent controls and reports.

Expected: Unavailable calculations show their documented empty state; restoring location recomputes them without NaN or stale endpoints.

Playwright: [src/tests/playwright/behavior/missionLander.spec.ts:28](../../../src/tests/playwright/behavior/missionLander.spec.ts#L28) — location-dependent controls and comparison values recover after the lander is restored (chromium).

Evidence boundary: Clears the lander location and elevation and exercises station QuickMap and Set to Lander controls, the station walkback unavailable state, the documented zero Max distance from lander report state, and no NaN display. Restores a known location through Mission Preferences, then verifies those controls, report calculation, and both EVA boundary traverse endpoints recalculate. This uses an execution fixture with four comparison columns.

## CFG-006: Projection and action version administration

**P0 · Mapped**

Action: Use authorized admin controls to change projection/action version; open fresh and existing clients.

Expected: Allowed fields persist, rendering and pane availability follow configuration, and normal editors cannot change admin-only fields.

Playwright: [src/tests/playwright/behavior/adminPermissions.spec.ts:29](../../../src/tests/playwright/behavior/adminPermissions.spec.ts#L29) — admin projection and action-version changes persist to live and fresh editor clients (chromium).

Playwright: [src/tests/playwright/behavior/referenceValidation.spec.ts:325](../../../src/tests/playwright/behavior/referenceValidation.spec.ts#L325) — mission reference navigation falls back when an action version removes the selected tab (chromium).

Evidence boundary: The super-admin changes action-system version and the editor mission from built-in EPSG:3857 to valid custom EPSG:4326 longlat through the admin UI with geographic bounds/resolution. The test verifies persisted config, live and fresh editor map projection plus the known station feature coordinates in both CRSs, live/reloaded pane availability, and a mission editor HTTP attempt to change the configuration is denied with the authoritative values unchanged.

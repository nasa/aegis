# Mission preferences and defaults

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Blank mission with known lander, rates, banner, projection and action-system version.

Source: [src/components/panes/mission/mission-right-prefs.tsx](../../../src/components/panes/mission/mission-right-prefs.tsx), [src/operations/apply/apply-mission.ts](../../../src/operations/apply/apply-mission.ts).

Scenario mapping: **2/6 (33.3%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

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

**P0 · Gap**

Action: Change mission traverse/walkback rates and EVA duration with inherited and explicit entity overrides.

Expected: Inherited consumers update; explicit overrides survive; clearing an override restores inheritance.

## CFG-004: Lander relocation cascades

**P0 · Gap**

Action: Move the lander with stations, walkbacks and multiple EVA egress/ingress copies; reload and observe a peer.

Expected: Location/elevation, walkback endpoints and affected paths update coherently without moving unrelated stations.

## CFG-005: Lander absent and restored

**P1 · Gap**

Action: Clear/set lander location and open location-dependent controls and reports.

Expected: Unavailable calculations show their documented empty state; restoring location recomputes them without NaN or stale endpoints.

## CFG-006: Projection and action version administration

**P0 · Gap**

Action: Use authorized admin controls to change projection/action version; open fresh and existing clients.

Expected: Allowed fields persist, rendering and pane availability follow configuration, and normal editors cannot change admin-only fields.

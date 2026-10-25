# EVA sequence editing and plan identity

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Two planned EVAs sharing a station, located lander, actions, traverses and execution copies.

Source: [src/components/panes/eva/eva-right.tsx](../../../src/components/panes/eva/eva-right.tsx), [src/operations/helpers/evaSequence.ts](../../../src/operations/helpers/evaSequence.ts), [src/operations/stage/stage-eva.ts](../../../src/operations/stage/stage-eva.ts).

Scenario mapping: **13/13 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/operations/helpers/evaSequence.test.ts](../../../src/tests/vitest/operations/helpers/evaSequence.test.ts), [src/tests/vitest/store/thunks/eva_thunk.test.ts](../../../src/tests/vitest/store/thunks/eva_thunk.test.ts).

## EVA-001: a new EVA starts with a complete lander-to-lander sequence and can be removed without touching other plans

**P0 · Mapped**

Action: a new EVA starts with a complete lander-to-lander sequence and can be removed without touching other plans

Expected: New EVA owns a complete lander-to-lander station/traverse sequence; removing it restores the original graph.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:308](../../../src/tests/playwright/behavior/planning.spec.ts#L308) — a new EVA starts with a complete lander-to-lander sequence and can be removed without touching other plans (chromium).

## EVA-002: duplicating an EVA shares planned stations but owns new traverses

**P0 · Mapped**

Action: duplicating an EVA shares planned stations but owns new traverses

Expected: Ordinary EVA duplication shares planned stations, allocates new traverses and lineage, and leaves the original plan unchanged.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:375](../../../src/tests/playwright/behavior/planning.spec.ts#L375) — duplicating an EVA shares planned stations but owns new traverses (chromium).

## EVA-003: duplicating an EVA with stations clones its complete station and action tree

**P0 · Mapped**

Action: duplicating an EVA with stations clones its complete station and action tree

Expected: Duplicate with Stations allocates independent stations, actions and traverses with copied locations and new identities; the original tree stays unchanged.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:418](../../../src/tests/playwright/behavior/planning.spec.ts#L418) — duplicating an EVA with stations clones its complete station and action tree (chromium).

## EVA-004: deleting a planned EVA retains shared stations and the other plan

**P0 · Mapped**

Action: deleting a planned EVA retains shared stations and the other plan

Expected: Deleting one planned EVA retains shared stations, their actions and the other plan while removing its own traverses.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:525](../../../src/tests/playwright/behavior/planning.spec.ts#L525) — deleting a planned EVA retains shared stations and the other plan (chromium).

## EVA-005: two executions of the same plan have distinct entities and deleting the plan cascades only through its executions

**P0 · Mapped**

Action: two executions of the same plan have distinct entities and deleting the plan cascades only through its executions

Expected: Two REX copies have distinct entities with shared planning lineage; deleting the plan removes exactly its execution families and retains the unrelated plan.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:551](../../../src/tests/playwright/behavior/planning.spec.ts#L551) — two executions of the same plan have distinct entities and deleting the plan cascades only through its executions (chromium).

## EVA-006: EVA metadata and validation

**P1 · Mapped**

Action: Rename EVA, change description/color/start UTC/duration/rate; test blank, duplicate and numeric boundaries; reload.

Expected: Saved values and generated labels persist, invalid/canceled edits do not, and planned versus REX name scopes remain distinct.

Playwright: [src/tests/playwright/behavior/evaMetadataLifecycle.spec.ts:75](../../../src/tests/playwright/behavior/evaMetadataLifecycle.spec.ts#L75) — validates plan metadata with two editors while REX names stay family-scoped (chromium).

Playwright: [src/tests/playwright/behavior/evaMetadataLifecycle.spec.ts:38](../../../src/tests/playwright/behavior/evaMetadataLifecycle.spec.ts#L38) — UTC fields combine an initially empty date and time only after explicit saves and preserve canceled edits (chromium).

Evidence boundary: Two active editors converge on explicit UTC saves without replaying stale local values. Full metadata validation, plan/REX name isolation, saved/canceled values and a fresh client are checked; a separate empty-date/time case checks explicit partial input and cancellation.

## EVA-007: Add and replace itinerary stations

**P0 · Mapped**

Action: Insert first/middle/last stations and replace a slot using existing, new and lander endpoints.

Expected: The sequence alternates station/traverse, starts and ends at stations and creates exactly the needed paths.

Playwright: [src/tests/playwright/behavior/evaItinerary90.spec.ts:368](../../../src/tests/playwright/behavior/evaItinerary90.spec.ts#L368) — adding and replacing itinerary stations keeps shared stations and owned traverse paths aligned (chromium).

Evidence boundary: Uses a test-owned 64×32 synthetic GeoTIFF in EPSG:3857 with bounded station coordinates and known cell elevations. The real EVA editor adds three stations, reorders added slots to first/middle/last positions, replaces a shared station, uses shared and managed lander endpoints, and checks alternating sequence order, independently recomputed traverse paths/profiles, preserved shared station/action and other-EVA ownership, peer state, and reload persistence. The test removes its own raster after each run.

## EVA-008: Remove and reorder itinerary stations

**P0 · Mapped**

Action: Move/remove first, interior and last slots with actions and active selections.

Expected: Adjacent traverse endpoints and names reconcile; unused owned data is cleaned up; shared stations survive.

Playwright: [src/tests/playwright/behavior/evaItinerary90.spec.ts:550](../../../src/tests/playwright/behavior/evaItinerary90.spec.ts#L550) — reordering and removing itinerary stations updates paths and cleans only owned traverse actions (chromium).

Evidence boundary: Uses the same test-owned small synthetic GeoTIFF and known point elevations. The real editor adds stations, moves first/middle/last regular slots, selects and removes a shared station, removes interior and last regular slots, and verifies exact order, regenerated paths and independent profiles, deletion of an owned traverse action, survival/enabled state of shared and retained station actions, peer state, and reload persistence. The test removes its own raster after each run.

## EVA-009: Change egress and ingress

**P0 · Mapped**

Action: Switch each endpoint between lander copy and regular station and back.

Expected: Managed copies/actions are owned correctly, endpoint traverses update, and unrelated stations remain intact.

Playwright: [src/tests/playwright/behavior/evaBoundaryLifecycle.spec.ts:9](../../../src/tests/playwright/behavior/evaBoundaryLifecycle.spec.ts#L9) — switches egress from managed lander copy to a regular station and back (chromium).

Playwright: [src/tests/playwright/behavior/evaBoundaryLifecycle.spec.ts:9](../../../src/tests/playwright/behavior/evaBoundaryLifecycle.spec.ts#L9) — switches ingress from managed lander copy to a regular station and back (chromium).

Evidence boundary: Both endpoints switch from a managed lander copy to a regular station and back. A real managed-owned child action is deleted, regular-station actions survive exactly, boundary geometry follows the selected location, unrelated graph data and peer/reload remain correct.

## EVA-010: Empty and unresolved sequence slots

**P1 · Mapped**

Action: Create supported empty station slots and load a fixture with an unresolved reference.

Expected: UI explains missing selection; reports and map do not crash or silently substitute another entity.

Playwright: [src/tests/playwright/behavior/evaBoundaryLifecycle.spec.ts:142](../../../src/tests/playwright/behavior/evaBoundaryLifecycle.spec.ts#L142) — Add Station creates an explicit empty selector without substituting a station (chromium).

Evidence boundary: UI-created empty slot and a separately arranged unresolved station UUID both show missing selection without substituted data; sequence identity, report rendering, map absence and peer/reload are checked.

## EVA-011: EVA folder duplicate and delete confirmations

**P1 · Mapped**

Action: Cancel duplicate-with-stations and delete dialogs; confirm deletion with several REX families.

Expected: Cancel preserves the graph; confirmed deletion enumerates and cleans only the intended ownership tree.

Playwright: [src/tests/playwright/behavior/evaDeleteOwnership.spec.ts:19](../../../src/tests/playwright/behavior/evaDeleteOwnership.spec.ts#L19) — canceling duplicate and delete preserves the graph; confirmation deletes only one plan and its REX family (chromium).

Playwright: [src/tests/playwright/behavior/planning.spec.ts:551](../../../src/tests/playwright/behavior/planning.spec.ts#L551) — two executions of the same plan have distinct entities and deleting the plan cascades only through its executions (chromium).

Evidence boundary: Duplicate-with-stations and EVA-delete confirmations can be canceled without any graph change. Confirmed deletion removes only the intended plan/REX ownership tree while shared planned stations and the other family survive.

## EVA-012: EVA aggregate actions and resource totals

**P0 · Mapped**

Action: Use known enabled/disabled station and traverse actions assigned to EV1/EV2.

Expected: EVA action list, mass, consumables, dwell, travel and total duration match independent expected quantities.

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:58](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L58) — enabled station and traverse work controls EVA resources, timeline and report totals through deactivation and reactivation (chromium).

Evidence boundary: Known 6-minute EV1 station work and 5-minute EV2 traverse work plus 10-minute movement: EVA aggregate list, 1750g, five consumables, 6/15/21 minute station/traverse/total times; excluded 99-minute/99000g disabled work.

## EVA-013: Sequence timeline selection and time preview

**P1 · Mapped**

Action: Select sequence items and scrub planned time across station/traverse boundaries.

Expected: Map/timeline use the selected EVA and time; editing sequence/duration refreshes the corresponding positions.

Playwright: [src/tests/playwright/behavior/evaTimeline90.spec.ts:109](../../../src/tests/playwright/behavior/evaTimeline90.spec.ts#L109) — timeline selection and scrubbing preview the selected EVA and refresh after duration edits (chromium).

Evidence boundary: Seeds distinct EVA start dates and traverse durations, previews station and traverse intervals through timeline hover, verifies astronaut map position from independently projected fixture coordinates, selects sequence rows for both EVAs and checks their distinct traverse durations, confirms view-only selection and hover do not write mission data, then edits Alpha station duration and checks the shifted timeline/map positions plus unrelated station/traverse/action/EVA values.

# EVA sequence editing and plan identity

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Two planned EVAs sharing a station, located lander, actions, traverses and execution copies.

Source: [src/components/panes/eva/eva-right.tsx](../../../src/components/panes/eva/eva-right.tsx), [src/operations/helpers/evaSequence.ts](../../../src/operations/helpers/evaSequence.ts), [src/operations/stage/stage-eva.ts](../../../src/operations/stage/stage-eva.ts).

Scenario mapping: **5/13 (38.5%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

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

**P1 · Gap**

Action: Rename EVA, change description/color/start UTC/duration/rate; test blank, duplicate and numeric boundaries; reload.

Expected: Saved values and generated labels persist, invalid/canceled edits do not, and planned versus REX name scopes remain distinct.

## EVA-007: Add and replace itinerary stations

**P0 · Gap**

Action: Insert first/middle/last stations and replace a slot using existing, new and lander endpoints.

Expected: The sequence alternates station/traverse, starts and ends at stations and creates exactly the needed paths.

## EVA-008: Remove and reorder itinerary stations

**P0 · Gap**

Action: Move/remove first, interior and last slots with actions and active selections.

Expected: Adjacent traverse endpoints and names reconcile; unused owned data is cleaned up; shared stations survive.

## EVA-009: Change egress and ingress

**P0 · Gap**

Action: Switch each endpoint between lander copy and regular station and back.

Expected: Managed copies/actions are owned correctly, endpoint traverses update, and unrelated stations remain intact.

## EVA-010: Empty and unresolved sequence slots

**P1 · Gap**

Action: Create supported empty station slots and load a fixture with an unresolved reference.

Expected: UI explains missing selection; reports and map do not crash or silently substitute another entity.

## EVA-011: EVA folder duplicate and delete confirmations

**P1 · Gap**

Action: Cancel duplicate-with-stations and delete dialogs; confirm deletion with several REX families.

Expected: Cancel preserves the graph; confirmed deletion enumerates and cleans only the intended ownership tree.

## EVA-012: EVA aggregate actions and resource totals

**P0 · Gap**

Action: Use known enabled/disabled station and traverse actions assigned to EV1/EV2.

Expected: EVA action list, mass, consumables, dwell, travel and total duration match independent expected quantities.

## EVA-013: Sequence timeline selection and time preview

**P1 · Gap**

Action: Select sequence items and scrub planned time across station/traverse boundaries.

Expected: Map/timeline use the selected EVA and time; editing sequence/duration refreshes the corresponding positions.

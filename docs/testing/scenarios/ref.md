# Mission reference data and templates

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Separate v1/v2 missions with definitions used and unused by actions, templates, rules, presets and stations.

Source: [src/components/panes/mission/mission-right-actionDefinitions.tsx](../../../src/components/panes/mission/mission-right-actionDefinitions.tsx), [src/components/panes/mission/mission-right-actionTemplates.tsx](../../../src/components/panes/mission/mission-right-actionTemplates.tsx), [src/components/panes/mission/mission-right-equipment.tsx](../../../src/components/panes/mission/mission-right-equipment.tsx), [src/components/panes/mission/mission-right-geographicUnits.tsx](../../../src/components/panes/mission/mission-right-geographicUnits.tsx), [src/components/panes/mission/mission-right-circles.tsx](../../../src/components/panes/mission/mission-right-circles.tsx), [src/components/panes/mission/mission-right-missionPriorities.tsx](../../../src/components/panes/mission/mission-right-missionPriorities.tsx).

Scenario mapping: **0/9 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/operations/op-actionDefinition.test.ts](../../../src/tests/vitest/operations/op-actionDefinition.test.ts), [src/tests/vitest/operations/op-missionPriority.test.ts](../../../src/tests/vitest/operations/op-missionPriority.test.ts).

## REF-001: Definition CRUD and wording

**P1 · Partial**

Action: Add/rename/delete unused verbs, nouns and adjectives; change singular/plural labels and conjunctions; reload.

Expected: Lists, generated action wording and persisted definitions agree; cancel and field validation preserve prior values.

Playwright: [src/tests/playwright/mission/mission.spec.ts:34](../../../src/tests/playwright/mission/mission.spec.ts#L34) — Action definitions (chromium).

Evidence boundary: Legacy imported-mission helper supplies narrower CRUD/UI evidence; complete fixture, references, failure cases and persisted downstream behavior remain unproved.

## REF-002: Definition usage guards

**P0 · Gap**

Action: Attempt to delete definitions used by POI/station/traverse actions, templates and STM rules.

Expected: Every live reference blocks deletion with useful usage information; removing references permits deletion.

## REF-003: Template CRUD and independence

**P1 · Partial**

Action: Create, edit, duplicate and delete a template; cancel deletion and reload.

Expected: Copies have independent identities/values, confirmation is respected, and unrelated templates remain unchanged.

Playwright: [src/tests/playwright/mission/mission.spec.ts:22](../../../src/tests/playwright/mission/mission.spec.ts#L22) — Action templates (chromium).

Evidence boundary: Legacy imported-mission helper supplies narrower CRUD/UI evidence; complete fixture, references, failure cases and persisted downstream behavior remain unproved.

## REF-004: Apply template and save action as template

**P0 · Gap**

Action: Apply a known template to each action parent; save an action as a template under allowed and forbidden roles.

Expected: All supported fields copy correctly with new action identity; later template changes do not retroactively mutate actions.

## REF-005: Equipment CRUD and consumer totals

**P1 · Partial**

Action: Add/edit/delete consumable and nonconsumable equipment used by actions/templates; reload.

Expected: Usage handling and quantity/consumable totals remain consistent; canceled or invalid edits do not persist.

Playwright: [src/tests/playwright/mission/mission.spec.ts:26](../../../src/tests/playwright/mission/mission.spec.ts#L26) — Equipment (chromium).

Evidence boundary: Legacy imported-mission helper supplies narrower CRUD/UI evidence; complete fixture, references, failure cases and persisted downstream behavior remain unproved.

## REF-006: Geographic unit CRUD and references

**P1 · Partial**

Action: In v1 create/edit/delete geographic units used by actions and templates.

Expected: Supported reference cleanup or guards are explicit; values and report consumers survive reload without dangling selections.

Playwright: [src/tests/playwright/mission/mission.spec.ts:30](../../../src/tests/playwright/mission/mission.spec.ts#L30) — Geographic units (chromium).

Evidence boundary: Legacy imported-mission helper supplies narrower CRUD/UI evidence; complete fixture, references, failure cases and persisted downstream behavior remain unproved.

## REF-007: Circle definition lifecycle

**P1 · Partial**

Action: Create, rename, resize and delete circles while presets/stations reference them; observe a peer.

Expected: New circles initialize hidden, deletion prunes references, and radius ordering and map geometry match saved values.

Playwright: [src/tests/playwright/mission/mission.spec.ts:18](../../../src/tests/playwright/mission/mission.spec.ts#L18) — Circle definitions (chromium).

Evidence boundary: Legacy imported-mission helper supplies narrower CRUD/UI evidence; complete fixture, references, failure cases and persisted downstream behavior remain unproved.

## REF-008: Mission priority identifiers

**P1 · Gap**

Action: Create/edit/reorder/delete priorities; assign them to STM and non-STM actions and templates.

Expected: Priority labels/colors/order and usage handling propagate to actions and reports without rewriting unrelated values.

## REF-009: Reference validation matrix

**P1 · Gap**

Action: Exercise required, duplicate, abbreviation length, radius minimum and numeric boundaries for every reference type.

Expected: Invalid values cannot replace saved values; Cancel preserves both lists and downstream consumers.

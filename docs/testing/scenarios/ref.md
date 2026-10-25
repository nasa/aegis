# Mission reference data and templates

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Separate v1/v2 missions with definitions used and unused by actions, templates, rules, presets and stations.

Source: [src/components/panes/mission/mission-right-actionDefinitions.tsx](../../../src/components/panes/mission/mission-right-actionDefinitions.tsx), [src/components/panes/mission/mission-right-actionTemplates.tsx](../../../src/components/panes/mission/mission-right-actionTemplates.tsx), [src/components/panes/mission/mission-right-equipment.tsx](../../../src/components/panes/mission/mission-right-equipment.tsx), [src/components/panes/mission/mission-right-geographicUnits.tsx](../../../src/components/panes/mission/mission-right-geographicUnits.tsx), [src/components/panes/mission/mission-right-circles.tsx](../../../src/components/panes/mission/mission-right-circles.tsx), [src/components/panes/mission/mission-right-missionPriorities.tsx](../../../src/components/panes/mission/mission-right-missionPriorities.tsx).

Scenario mapping: **8/9 (88.9%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/operations/op-actionDefinition.test.ts](../../../src/tests/vitest/operations/op-actionDefinition.test.ts), [src/tests/vitest/operations/op-missionPriority.test.ts](../../../src/tests/vitest/operations/op-missionPriority.test.ts).

## REF-001: Definition CRUD and wording

**P1 · Mapped**

Action: Add/rename/delete unused verbs, nouns and adjectives; change singular/plural labels and conjunctions; reload.

Expected: Lists, generated action wording and persisted definitions agree; cancel and field validation preserve prior values.

Playwright: [src/tests/playwright/behavior/referenceData.spec.ts:65](../../../src/tests/playwright/behavior/referenceData.spec.ts#L65) — v2 definition entries and wording edit, reject invalid drafts, and persist together (chromium).

Evidence boundary: All three definition categories have UI create/edit/delete evidence; singular/plural labels and conjunctions drive a seeded v2 action wording, invalid Save/Cancel preserves data, and definitions/wording survive reload.

## REF-002: Definition usage guards

**P0 · Mapped**

Action: Attempt to delete definitions used by POI/station/traverse actions, templates and STM rules.

Expected: Every live reference blocks deletion with useful usage information; removing references permits deletion.

Playwright: [src/tests/playwright/behavior/definitionUsageCoverage.spec.ts:12](../../../src/tests/playwright/behavior/definitionUsageCoverage.spec.ts#L12) — each definition category blocks all action parents, templates and rules until every live reference is removed (chromium).

## REF-003: Template CRUD and independence

**P1 · Mapped**

Action: Create, edit, duplicate and delete a template; cancel deletion and reload.

Expected: Copies have independent identities/values, confirmation is respected, and unrelated templates remain unchanged.

Playwright: [src/tests/playwright/behavior/referenceData.spec.ts:588](../../../src/tests/playwright/behavior/referenceData.spec.ts#L588) — action templates duplicate with independent identity and values, and deletion cancellation preserves siblings (chromium).

Evidence boundary: UI-created templates duplicate into independent identities/names/descriptions, sibling edits remain independent, delete Cancel/confirm preserves intended survivors and reload agrees.

## REF-004: Apply template and save action as template

**P0 · Mapped**

Action: Apply a known template to each action parent; save an action as a template under allowed and forbidden roles.

Expected: All supported fields copy correctly with new action identity; later template changes do not retroactively mutate actions.

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v1 fully populated poi action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v1 fully populated station action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v1 fully populated traverse action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v2 fully populated poi action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v2 fully populated station action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:40](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L40) — v2 fully populated traverse action template round trip retains supported fields with independent identity (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:171](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L171) — viewer template creation observes the real account permission while action reads remain available (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:171](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L171) — editor template creation observes the real account permission while action reads remain available (chromium).

Playwright: [src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts:171](../../../src/tests/playwright/behavior/actionTemplateRoundTripCoverage.spec.ts#L171) — admin template creation observes the real account permission while action reads remain available (chromium).

## REF-005: Equipment CRUD and consumer totals

**P1 · Mapped**

Action: Add/edit/delete consumable and nonconsumable equipment used by actions/templates; reload.

Expected: Usage handling and quantity/consumable totals remain consistent; canceled or invalid edits do not persist.

Playwright: [src/tests/playwright/behavior/referenceData.spec.ts:219](../../../src/tests/playwright/behavior/referenceData.spec.ts#L219) — equipment inventory supports both item types, validates quantity, and survives reload (chromium).

Evidence boundary: Consumable/reusable UI CRUD, invalid quantity Save/Cancel, action/template assignments and in-use guards are covered. After reload with references retained, two stations each show one consumable while their EVA shows two, excluding reusable equipment. Reference cleanup permits successful deletion and reload.

## REF-006: Geographic unit CRUD and references

**P1 · Mapped**

Action: In v1 create/edit/delete geographic units used by actions and templates.

Expected: Supported reference cleanup or guards are explicit; values and report consumers survive reload without dangling selections.

Playwright: [src/tests/playwright/behavior/referenceData.spec.ts:460](../../../src/tests/playwright/behavior/referenceData.spec.ts#L460) — geographic units can be created and edited with abbreviation validation and durable values (chromium).

Evidence boundary: v1 geographic-unit UI CRUD, abbreviation invalid Save/Cancel, action/template assignments and deletion guards are explicit. Reload with live references retains the action label; an actual All Actions JSON download resolves geographicalUnitsReadable to the independent expected unit name. Removing references permits deletion with no dangling selections after reload.

## REF-007: Circle definition lifecycle

**P1 · Mapped**

Action: Create, rename, resize and delete circles while presets/stations reference them; observe a peer.

Expected: New circles initialize hidden, deletion prunes references, and radius ordering and map geometry match saved values.

Playwright: [src/tests/playwright/behavior/referenceCircles.spec.ts:60](../../../src/tests/playwright/behavior/referenceCircles.spec.ts#L60) — circle definitions create hidden controls, sort by radius, render saved geometry, and prune every reference (chromium).

Evidence boundary: Circle creation initializes hidden controls for all presets/non-egress stations. Name/radius edits and validation, radius ordering, independent 350m map geometry on a peer, deletion reference pruning and reload are covered.

## REF-008: Mission priority identifiers

**P1 · Mapped**

Action: Create/edit/delete category and trace identifiers; inspect natural numeric ordering; assign them to STM/non-STM actions and templates and observe a peer/reload.

Expected: Trace/category labels and natural order reach supported action/template consumers, referenced identifiers are protected and removing references permits deletion without unrelated rewrites. Colors/manual reordering are unsupported.

Playwright: [src/tests/playwright/behavior/missionPriorities.spec.ts:55](../../../src/tests/playwright/behavior/missionPriorities.spec.ts#L55) — mission priority traces sort, rename through actions/templates, block in-use deletion, and clean up after references are removed (chromium).

Evidence boundary: Supported trace/category fields have UI lifecycle, numeric trace ordering and independent category ordering (Astronomy/Instrumentation). STM/non-STM action and template labels/assignments, renamed template options after reload, peer updates, in-use guards and cleanup are covered. Color/manual-order fields and controls do not exist and are not claimed.

## REF-009: Reference validation matrix

**P1 · Gap**

Action: Exercise required, duplicate, abbreviation length, radius minimum and numeric boundaries for every reference type.

Expected: Invalid values cannot replace saved values; Cancel preserves both lists and downstream consumers.

# JSON, GeoJSON and external handoff exports

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Planning and executed mission with known coordinates, units, relationships, sample data and export subsets.

Source: [src/components/panes/mission/mission-right-export.tsx](../../../src/components/panes/mission/mission-right-export.tsx), [src/utils/export.ts](../../../src/utils/export.ts).

Scenario mapping: **5/7 (71.4%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/utils/export.test.ts](../../../src/tests/vitest/utils/export.test.ts), [src/tests/vitest/utils/quickMap.test.ts](../../../src/tests/vitest/utils/quickMap.test.ts).

## EXPORT-001: JSON export contains the saved planning values and nested station/action relationships

**P0 · Mapped**

Action: JSON export contains the saved planning values and nested station/action relationships

Expected: Downloaded JSON contains saved station name, station action/POI relationships and exact EVA sequence UUID order matching the independently seeded mission.

Playwright: [src/tests/playwright/behavior/planning.spec.ts:609](../../../src/tests/playwright/behavior/planning.spec.ts#L609) — JSON export contains the saved planning values and nested station/action relationships (chromium).

## EXPORT-002: Mission export subset selection and content

**P0 · Mapped**

Action: Toggle every export category separately and in combinations; parse downloads.

Expected: Filename and actual included/omitted entities match selection, references are readable and JSON contains the intended mission only.

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected evas category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected exportMission category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected pois category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected stations category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected actions category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected traverses category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:54](../../../src/tests/playwright/behavior/exports.spec.ts#L54) — mission export includes only the selected rexes category (chromium).

Playwright: [src/tests/playwright/behavior/exports.spec.ts:82](../../../src/tests/playwright/behavior/exports.spec.ts#L82) — combined and empty export selections match their filenames and preserve mission state (chromium).

## EXPORT-003: EVA and REX export fidelity

**P0 · Mapped**

Action: Export a plan and a REX with statuses, executed mass, sample values and preserved lineage.

Expected: Each file contains the intended concrete identities, order, units and execution values without cross-plan or historical leakage.

Playwright: [src/tests/playwright/behavior/exports.spec.ts:109](../../../src/tests/playwright/behavior/exports.spec.ts#L109) — plan and execution exports preserve sequence lineage, sample values and execution ownership (chromium).

## EXPORT-004: Position GeoJSON geometry and metadata

**P0 · Mapped**

Action: Export multiple position types/sources with exact PET and dates; inspect coordinates and properties.

Expected: GeoJSON uses longitude/latitude order and expected feature grouping, times, labels and metadata for the selected REX.

Playwright: [src/tests/playwright/behavior/exports.spec.ts:181](../../../src/tests/playwright/behavior/exports.spec.ts#L181) — position GeoJSON preserves longitude latitude order, PET, type and source for the selected execution (chromium).

## EXPORT-005: Export absent and zero values

**P1 · Mapped**

Action: Export absent/zero durations, masses, locations, empty lists and Unicode names.

Expected: The output preserves the intended distinctions and valid encoding/schema without NaN or fabricated coordinates.

Playwright: [src/tests/playwright/behavior/exports.spec.ts:234](../../../src/tests/playwright/behavior/exports.spec.ts#L234) — exports retain null and zero values, empty lists and Unicode without fabricated coordinates (chromium).

## EXPORT-006: Mission dump import and round trip

**P0 · Gap**

Action: Dump a disposable mission, import/restore it through supported admin flow and compare a fresh client.

Expected: Document/relational identity rules, assets and migration boundaries are explicit; relationships and required values survive the supported round trip.

## EXPORT-007: Download failure and read-only access

**P1 · Gap**

Action: Download as viewer/editor with delayed or failed generation and repeated clicks.

Expected: Allowed reads work, failure is visible, and downloads do not mutate mission state or mix data from a newly selected mission.

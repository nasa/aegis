# Time, distance, crew and resource calculations

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Independent numeric fixtures: EV1 10 min, EV2 4 min, unassigned 1 min; joint 3 min plus solo 2/5 min; 500 m at 3 km/h.

Source: [src/store/processing/calculatedFields.ts](../../../src/store/processing/calculatedFields.ts), [src/utils/mapping/geoMath.ts](../../../src/utils/mapping/geoMath.ts).

Scenario mapping: **2/9 (22.2%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/calculatedFields.test.ts](../../../src/tests/vitest/store/calculatedFields.test.ts), [src/tests/vitest/utils/geoMath.test.ts](../../../src/tests/vitest/utils/geoMath.test.ts), [src/tests/vitest/utils/rex.test.ts](../../../src/tests/vitest/utils/rex.test.ts).

## CALC-001: Crew dwell and joint actions

**P0 · Mapped**

Action: Render the 10/4/1 and joint-3-plus-solo-2/5 action fixtures through station and EVA UI.

Expected: Work totals are 15 and 10 minutes; joint crew times are 5/8 and dwell 8; unassigned warnings remain distinct from duration.

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:60](../../../src/tests/playwright/behavior/calculations.spec.ts#L60) — separate crew and unassigned work retains distinct work, crew and dwell totals through station and EVA views (chromium).

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:60](../../../src/tests/playwright/behavior/calculations.spec.ts#L60) — joint crew and solo work retains distinct work, crew and dwell totals through station and EVA views (chromium).

## CALC-002: Disabled action filtering at every consumer

**P0 · Gap**

Action: Deactivate a known action and inspect parent, EVA, timeline, mass, equipment and report totals.

Expected: Each intended consumer excludes disabled work without deleting its identity; reactivation restores exact values.

## CALC-003: Travel rate precedence and zero fallback

**P0 · Mapped**

Action: Use a 500 m traverse at 3 km/h then vary mission/EVA/traverse override with unset, zero and explicit rate.

Expected: Base movement is 10 minutes; precedence and zero/unset fallback agree across info, sequence and reports.

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:111](../../../src/tests/playwright/behavior/calculations.spec.ts#L111) — 500 meter travel uses traverse then EVA then mission rate and zero restores inherited calculations (chromium).

## CALC-004: Manual duration and rounding boundaries

**P0 · Gap**

Action: Use two 1.2-minute sequence items and manual unset/zero/negative/positive overrides.

Expected: Per-item ceiling, total display and raw timeline seconds follow documented semantics; form validity is tested separately.

## CALC-005: Traversal movement plus action dwell

**P0 · Gap**

Action: Use movement 10 min and action dwell 5 min; inspect calculated/resolved start/end clocks.

Expected: Each display uses its documented 15-minute combined or 10-minute movement quantity consistently; unresolved discrepancies are recorded.

## CALC-006: Override warning severity thresholds

**P1 · Gap**

Action: Use exact ratios .75, .9, 1.1 and 1.25 and values just outside them.

Expected: Warning classes match the actual agreed inclusive/exclusive boundary behavior and do not depend on rounded labels.

## CALC-007: Mass absent versus zero and units

**P0 · Gap**

Action: Mix planned grams, absent executed mass and entered zero/nonzero executed mass.

Expected: Grams-to-kilograms conversion occurs at the correct display boundary; entered zero is distinguished from missing and delta mass is correct.

## CALC-008: Geodesy and disconnected segment totals

**P0 · Gap**

Action: Use known lunar/Earth point pairs and disjoint elevation segments near the pole.

Expected: Distances/bearings use the intended sphere/CRS; ascent/descent do not bridge disconnected segments.

## CALC-009: Empty graph and extreme valid values

**P1 · Gap**

Action: Render no actions/crew/coordinates and large valid durations/distances.

Expected: All consumers produce documented empty/zero states without NaN, Infinity, negative wrap or stale totals.

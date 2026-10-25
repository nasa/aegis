# Time, distance, crew and resource calculations

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Independent numeric fixtures: EV1 10 min, EV2 4 min, unassigned 1 min; joint 3 min plus solo 2/5 min; 500 m at 3 km/h.

Source: [src/store/processing/calculatedFields.ts](../../../src/store/processing/calculatedFields.ts), [src/utils/mapping/geoMath.ts](../../../src/utils/mapping/geoMath.ts).

Scenario mapping: **9/9 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/calculatedFields.test.ts](../../../src/tests/vitest/store/calculatedFields.test.ts), [src/tests/vitest/utils/geoMath.test.ts](../../../src/tests/vitest/utils/geoMath.test.ts), [src/tests/vitest/utils/rex.test.ts](../../../src/tests/vitest/utils/rex.test.ts).

## CALC-001: Crew dwell and joint actions

**P0 · Mapped**

Action: Render the 10/4/1 and joint-3-plus-solo-2/5 action fixtures through station and EVA UI.

Expected: Work totals are 15 and 10 minutes; joint crew times are 5/8 and dwell 8; unassigned warnings remain distinct from duration.

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:60](../../../src/tests/playwright/behavior/calculations.spec.ts#L60) — separate crew and unassigned work retains distinct work, crew and dwell totals through station and EVA views (chromium).

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:60](../../../src/tests/playwright/behavior/calculations.spec.ts#L60) — joint crew and solo work retains distinct work, crew and dwell totals through station and EVA views (chromium).

## CALC-002: Disabled action filtering at every consumer

**P0 · Mapped**

Action: Deactivate a known action and inspect parent, EVA, timeline, mass, equipment and report totals.

Expected: Each intended consumer excludes disabled work without deleting its identity; reactivation restores exact values.

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:58](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L58) — enabled station and traverse work controls EVA resources, timeline and report totals through deactivation and reactivation (chromium).

Evidence boundary: UI deactivation/reactivation checks station and EVA action/crew/mass/consumable totals, retained disabled identity, exported sequence-clock contribution and comparison report values, including reload.

## CALC-003: Travel rate precedence and zero fallback

**P0 · Mapped**

Action: Use a 500 m traverse at 3 km/h then vary mission/EVA/traverse override with unset, zero and explicit rate.

Expected: Base movement is 10 minutes; precedence and zero/unset fallback agree across info, sequence and reports.

Playwright: [src/tests/playwright/behavior/calculations.spec.ts:111](../../../src/tests/playwright/behavior/calculations.spec.ts#L111) — 500 meter travel uses traverse then EVA then mission rate and zero restores inherited calculations (chromium).

## CALC-004: Manual duration and rounding boundaries

**P0 · Mapped**

Action: Use two 1.2-minute sequence items and manual unset/zero/negative/positive overrides.

Expected: Per-item ceiling, total display and raw timeline seconds follow documented semantics; form validity is tested separately.

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:188](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L188) — fractional sequence estimates retain raw seconds while displayed totals ceil each item and manual overrides preserve zero and negative data (chromium).

Evidence boundary: Two 1.2-minute station items yield four resolved display minutes, three action display minutes and raw manual clock 0..72..144sec; null/zero/negative/positive imported override values exercised separately from UI validation/filtering.

## CALC-005: Traversal movement plus action dwell

**P0 · Mapped**

Action: Use movement 10 min and action dwell 5 min; inspect calculated/resolved start/end clocks.

Expected: Each display uses its documented 15-minute combined or 10-minute movement quantity consistently; unresolved discrepancies are recorded.

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:271](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L271) — ten minutes movement plus five minutes traverse work exposes combined durations and distinct calculated and resolved clocks (chromium).

Evidence boundary: The traverse/EVA sequence and total are 15 minutes; the exported movement alias remains 10 minutes. Calculated and resolved sequence clocks both span 0–900 seconds. The regression fixes double-counted dwell that previously shifted calculated start/end to 300/1200 seconds.

## CALC-006: Override warning severity thresholds

**P1 · Mapped**

Action: Use exact ratios .75, .9, 1.1 and 1.25 and values just outside them.

Expected: Warning classes match the actual agreed inclusive/exclusive boundary behavior and do not depend on rounded labels.

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:334](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L334) — station override warnings use strict ratio boundaries and retain exact severity independently of rounded totals (chromium).

Evidence boundary: Real station saves at 74/75/89/90/110/111/125/126 minutes are compared with independently known 100-minute work. Exact warning messages and severity classes record the existing strict thresholds and warning/error assignments.

## CALC-007: Mass absent versus zero and units

**P0 · Mapped**

Action: Mix planned grams, absent executed mass and entered zero/nonzero executed mass.

Expected: Grams-to-kilograms conversion occurs at the correct display boundary; entered zero is distinguished from missing and delta mass is correct.

Playwright: [src/tests/playwright/behavior/poiMassBoundaries.spec.ts:132](../../../src/tests/playwright/behavior/poiMassBoundaries.spec.ts#L132) — planned grams, absent mass, entered zero and nonzero execution mass retain their units and signed deltas in cards and comparison (chromium).

Evidence boundary: Actual mass absent/null/zero/1750g/cleared checked across cards, signed gram deltas and kg comparison cells, persistence/export/reload. Comparison metric fix preserves absent as null instead of zero.

## CALC-008: Geodesy and disconnected segment totals

**P0 · Mapped**

Action: Use known lunar/Earth point pairs and disjoint elevation segments near the pole.

Expected: Distances/bearings use the intended sphere/CRS; ascent/descent do not bridge disconnected segments.

Playwright: [src/tests/playwright/behavior/geodesyTerrain90.spec.ts:176](../../../src/tests/playwright/behavior/geodesyTerrain90.spec.ts#L176) — Earth measurement geodesy matches a known pair near the pole (chromium).

Playwright: [src/tests/playwright/behavior/geodesyTerrain90.spec.ts:176](../../../src/tests/playwright/behavior/geodesyTerrain90.spec.ts#L176) — Moon measurement geodesy matches a known pair near the pole (chromium).

Evidence boundary: Creates real UI measurements by dragging to known points near 89.9 degrees latitude, independently checks their CRS-transformed coordinates, spherical distances and bearings using Earth and lunar radii, then verifies the traverse UI totals only the within-segment elevation changes (15 m ascent, 10 m descent) across three disconnected segments.

## CALC-009: Empty graph and extreme valid values

**P1 · Mapped**

Action: Render no actions/crew/coordinates and large valid durations/distances.

Expected: All consumers produce documented empty/zero states without NaN, Infinity, negative wrap or stale totals.

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:376](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L376) — empty graphs and large valid durations display finite totals and independent zero states without mutating data (chromium).

Playwright: [src/tests/playwright/behavior/calculationBoundaries.spec.ts:439](../../../src/tests/playwright/behavior/calculationBoundaries.spec.ts#L439) — a traverse with geometry and zero cached distances keeps the EVA responsive and preserves its original points (chromium).

Evidence boundary: Empty actions, crew, coordinates and itinerary show finite zeros/warnings without writes. A 9999-minute station and traverse plus a billion-metre cached distance render/reload as 19998 minutes and 1,000,000,000 metres. Zero cached distances with nonzero geometry stay responsive after the subdivision guard.

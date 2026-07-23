/**
 * Tests for `utils/styles/polylines.ts` —
 *   - `lightenColor()`
 *   - `buildTraverseStyleFunction()`
 *   - `buildWalkbackStyleFunction()`
 *   - `buildMeasurementStyleFunction()`
 *
 * These style functions are pure: given a feature + resolution they
 * return an array of `Style` objects. We only verify the shape and
 * counts of the returned styles — we don't try to render anything.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import type { Point } from "ol/geom";
import { LineString } from "ol/geom";
import type { Style } from "ol/style";
import {
  lightenColor,
  buildTraverseStyleFunction,
  buildWalkbackStyleFunction,
  buildMeasurementStyleFunction,
  type TraverseStyleOptions,
} from "components/interface/map/utils/styles/polylines";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SIMPLE_LINE: [number, number][] = [
  [0, 0],
  [100, 0],
  [200, 100],
];

function makeLineFeature(coords: [number, number][] = SIMPLE_LINE): Feature {
  return new Feature(new LineString(coords));
}

function defaultTraverseOpts(
  overrides: Partial<TraverseStyleOptions> & { color?: string; isSelected?: boolean } = {}
): TraverseStyleOptions {
  const { color = "#3399cc", isSelected = false, ...rest } = overrides;
  return {
    weight: 3,
    selectedWeight: 8,
    showArrows: false,
    showBearings: false,
    showDistances: false,
    arrowSize: 12,
    arrowRepeat: 50,
    bearingLabelFontSize: 11,
    bearingLabelColor: "#ffcc00",
    distanceLabelFontSize: 12,
    distanceLabelColor: "#ffffff",
    getColor: () => color,
    getIsSelected: () => isSelected,
    ...rest,
  };
}

function styleHasGeometryType(s: Style, type: string): boolean {
  const g = s.getGeometry();
  if (!g || typeof g === "function" || typeof g === "string") return false;
  return g.getType() === type;
}

// ---------------------------------------------------------------------------
// lightenColor
// ---------------------------------------------------------------------------

describe("lightenColor", () => {
  it("returns a hex color brighter than the input", () => {
    const original = "#3399cc";
    const lighter = lightenColor(original, 0.3);
    expect(lighter).toMatch(/^#[0-9A-F]{6}$/i);
    expect(lighter.toLowerCase()).not.toBe(original.toLowerCase());
  });

  it("returns input unchanged when color is invalid", () => {
    const garbage = "not-a-color-####";
    expect(lightenColor(garbage)).toBe(garbage);
  });
});

// ---------------------------------------------------------------------------
// buildTraverseStyleFunction
// ---------------------------------------------------------------------------

describe("buildTraverseStyleFunction", () => {
  it("returns a single base stroke when nothing extra is enabled", () => {
    const fn = buildTraverseStyleFunction(defaultTraverseOpts());
    const styles = fn(makeLineFeature(), 1);
    expect(styles).toHaveLength(1);
    const stroke = styles[0].getStroke()!;
    expect(stroke.getColor()).toBe("#3399cc");
    expect(stroke.getWidth()).toBe(3);
  });

  it("uses lightened color and selectedWeight + selection halo when isSelected", () => {
    const fn = buildTraverseStyleFunction(
      defaultTraverseOpts({ isSelected: true, selectedWeight: 8 })
    );
    const styles = fn(makeLineFeature(), 1);
    // selection halo (unshifted) + base stroke
    expect(styles).toHaveLength(2);
    const halo = styles[0].getStroke()!;
    const base = styles[1].getStroke()!;
    expect(halo.getWidth()).toBeGreaterThan(base.getWidth());
    // base width should equal selectedWeight when selected
    expect(base.getWidth()).toBe(8);
    // both colors should differ from the unlightened input
    expect(base.getColor()).not.toBe("#3399cc");
  });

  it("does not add selection halo when isSelected but selectedWeight is 0", () => {
    const fn = buildTraverseStyleFunction(
      defaultTraverseOpts({ isSelected: true, selectedWeight: 0 })
    );
    const styles = fn(makeLineFeature(), 1);
    expect(styles).toHaveLength(1); // base only
  });

  it("adds at least one arrow per segment when showArrows is true", () => {
    const fn = buildTraverseStyleFunction(defaultTraverseOpts({ showArrows: true }));
    // Coarse resolution → arrow spacing exceeds each segment → 1 arrow/segment
    const styles = fn(makeLineFeature(), 1000);
    // 1 base stroke + 2 arrows (for 3-point line = 2 segments)
    const arrowStyles = styles.filter((s) => styleHasGeometryType(s, "Point") && s.getImage());
    expect(arrowStyles).toHaveLength(2);
  });

  it("adds multiple arrows along a long segment (spaced by arrowRepeat)", () => {
    const fn = buildTraverseStyleFunction(
      defaultTraverseOpts({ showArrows: true, arrowRepeat: 50 })
    );
    // Single 1000-unit segment at resolution 1 → spacing 50px → several arrows
    const styles = fn(
      makeLineFeature([
        [0, 0],
        [1000, 0],
      ]),
      1
    );
    const arrowStyles = styles.filter((s) => styleHasGeometryType(s, "Point") && s.getImage());
    expect(arrowStyles.length).toBeGreaterThan(1);
  });

  it("adds bearing labels per segment when showBearings is true", () => {
    const fn = buildTraverseStyleFunction(defaultTraverseOpts({ showBearings: true }));
    const styles = fn(makeLineFeature(), 1);
    const bearingLabels = styles.filter(
      (s) => s.getText() && s.getText()!.getText()!.toString().includes("°")
    );
    expect(bearingLabels).toHaveLength(2);
  });

  it("adds distance labels per segment when showDistances is true", () => {
    const fn = buildTraverseStyleFunction(defaultTraverseOpts({ showDistances: true }));
    const styles = fn(makeLineFeature(), 1);
    const distanceLabels = styles.filter(
      (s) => s.getText() && s.getText()!.getText()!.toString().endsWith("m")
    );
    expect(distanceLabels).toHaveLength(2);
  });

  it("skips zero-length / very-short segments", () => {
    const fn = buildTraverseStyleFunction(defaultTraverseOpts({ showArrows: true }));
    // Three points where two are coincident → one zero-length segment
    const coords: [number, number][] = [
      [0, 0],
      [0, 0],
      [100, 0],
    ];
    // Coarse resolution → the one real segment gets a single arrow
    const styles = fn(makeLineFeature(coords), 1000);
    const arrows = styles.filter((s) => styleHasGeometryType(s, "Point") && s.getImage());
    expect(arrows).toHaveLength(1);
  });

  it("returns base stroke even when feature has no geometry", () => {
    const fn = buildTraverseStyleFunction(defaultTraverseOpts({ showArrows: true }));
    const feat = new Feature();
    const styles = fn(feat, 1);
    // Base stroke still present; no arrows because there's no line
    expect(styles.length).toBeGreaterThanOrEqual(1);
    expect(styles[0].getStroke()).not.toBeNull();
  });

  it("uses configured bearing/distance label colors", () => {
    const fn = buildTraverseStyleFunction(
      defaultTraverseOpts({
        showBearings: true,
        showDistances: true,
        bearingLabelColor: "#ff00ff",
        distanceLabelColor: "#00ff00",
      })
    );
    const styles = fn(makeLineFeature(), 1);
    const bearing = styles.find(
      (s) => s.getText() && s.getText()!.getText()!.toString().includes("°")
    );
    const distance = styles.find(
      (s) => s.getText() && s.getText()!.getText()!.toString().endsWith("m")
    );
    expect((bearing!.getText()!.getFill()!.getColor() as string).toLowerCase()).toBe("#ff00ff");
    expect((distance!.getText()!.getFill()!.getColor() as string).toLowerCase()).toBe("#00ff00");
  });
});

// ---------------------------------------------------------------------------
// buildWalkbackStyleFunction
// ---------------------------------------------------------------------------

describe("buildWalkbackStyleFunction", () => {
  it("returns a dashed base stroke (plus directional arrows) with no overrides", () => {
    const fn = buildWalkbackStyleFunction();
    const styles = fn(makeLineFeature(), 1);
    // Base dashed stroke first, then directional chevrons along the path.
    const stroke = styles[0].getStroke()!;
    expect(stroke.getWidth()).toBeGreaterThan(0);
    // Dashed = lineDash array with at least one entry.
    const dash = stroke.getLineDash();
    expect(dash).not.toBeNull();
    expect(dash!.length).toBeGreaterThan(0);
    // Directional arrows are drawn by default (regression: walkbacks had none).
    const arrows = styles.filter((s) => styleHasGeometryType(s, "Point") && s.getImage());
    expect(arrows.length).toBeGreaterThan(0);
  });

  it("omits arrows when showArrows is false", () => {
    const fn = buildWalkbackStyleFunction({ showArrows: false });
    const styles = fn(makeLineFeature(), 1);
    expect(styles).toHaveLength(1);
  });

  it("passes color, weight, and dashPattern overrides through to the output", () => {
    const fn = buildWalkbackStyleFunction({
      color: "#ff8800",
      weight: 5,
      dashPattern: [10, 4],
    });
    const styles = fn(makeLineFeature(), 1);
    const stroke = styles[0].getStroke()!;
    expect(stroke.getColor()).toBe("#ff8800");
    expect(stroke.getWidth()).toBe(5);
    expect(stroke.getLineDash()).toEqual([10, 4]);
  });
});

// ---------------------------------------------------------------------------
// buildMeasurementStyleFunction
// ---------------------------------------------------------------------------

describe("buildMeasurementStyleFunction", () => {
  it("returns a base stroke + arrow + bearing + distance label per segment", () => {
    const fn = buildMeasurementStyleFunction({ color: "#ffcc00" });
    // Coarse resolution → one arrow per segment (spacing exceeds each segment).
    const styles = fn(makeLineFeature(), 1000);
    // 3-point line = 2 segments. Per segment: 1 arrow + 1 bearing label +
    // 1 distance label. Plus 1 base stroke. Total = 1 + 2*3 = 7.
    expect(styles).toHaveLength(7);

    const arrows = styles.filter((s) => styleHasGeometryType(s, "Point") && s.getImage());
    expect(arrows).toHaveLength(2);

    const bearingLabels = styles.filter(
      (s) => s.getText() && s.getText()!.getText()!.toString().includes("°")
    );
    expect(bearingLabels).toHaveLength(2);

    const distanceLabels = styles.filter(
      (s) => s.getText() && s.getText()!.getText()!.toString().endsWith("m")
    );
    expect(distanceLabels).toHaveLength(2);
  });

  it("respects color override on the base stroke", () => {
    const fn = buildMeasurementStyleFunction({ color: "#abcdef", weight: 5 });
    const styles = fn(makeLineFeature(), 1);
    const stroke = styles[0].getStroke()!;
    expect(stroke.getColor()).toBe("#abcdef");
    expect(stroke.getWidth()).toBe(5);
  });

  it("returns just the base stroke when feature has no geometry", () => {
    const fn = buildMeasurementStyleFunction({ color: "#fff" });
    const styles = fn(new Feature(), 1);
    expect(styles).toHaveLength(1);
  });

  it("places arrows at segment midpoints (geometry shifts to Point)", () => {
    const fn = buildMeasurementStyleFunction({ color: "#fff" });
    const styles = fn(makeLineFeature(), 1);
    const arrow = styles.find((s) => styleHasGeometryType(s, "Point") && s.getImage());
    const geom = arrow!.getGeometry() as Point;
    const [x, y] = geom.getCoordinates();
    // First segment of SIMPLE_LINE goes [0,0]→[100,0]; midpoint should be [50,0]
    expect(x).toBe(50);
    expect(y).toBe(0);
  });
});

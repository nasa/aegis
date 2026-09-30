/**
 * Tests for `utils/layers/circleLayer.ts` — `createCircleLayer()`.
 *
 * The factory builds a `VectorLayer<VectorSource>` containing the ring
 * feature(s) and an optional label feature. We assert layer + feature
 * shape; we don't render to canvas.
 */

import { describe, it, expect } from "vitest";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { Point, LineString } from "ol/geom";
import type Feature from "ol/Feature";
import type Style from "ol/style/Style";
import type { StyleFunction } from "ol/style/Style";
import { createCircleLayer } from "components/interface/map/utils/layers/circleLayer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CENTER: [number, number] = [0, 0];
const RADIUS = 1000;

function ringFeatures(layer: VectorLayer<VectorSource>): Feature[] {
  return layer
    .getSource()!
    .getFeatures()
    .filter((f) => f.getGeometry() instanceof LineString);
}

function labelFeature(layer: VectorLayer<VectorSource>): Feature | undefined {
  return layer
    .getSource()!
    .getFeatures()
    .find((f) => f.getGeometry() instanceof Point);
}

function getStyleFn(feature: Feature): StyleFunction | null {
  const style = feature.getStyleFunction();
  return style ?? null;
}

// ---------------------------------------------------------------------------
// Layer-level
// ---------------------------------------------------------------------------

describe("createCircleLayer — layer-level", () => {
  it("returns a VectorLayer with default zIndex 8 and visible true", () => {
    const layer = createCircleLayer(CENTER, RADIUS);
    expect(layer).toBeInstanceOf(VectorLayer);
    expect(layer.getZIndex()).toBe(8);
    expect(layer.getVisible()).toBe(true);
  });

  it("respects custom zIndex and visible options", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      zIndex: 15,
      visible: false,
    });
    expect(layer.getZIndex()).toBe(15);
    expect(layer.getVisible()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Solid mode
// ---------------------------------------------------------------------------

describe("createCircleLayer — solid", () => {
  it("creates exactly one ring feature (LineString)", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      stroke: { mode: "solid", color: "red", width: 2 },
      label: null,
    });
    expect(ringFeatures(layer)).toHaveLength(1);
  });

  it("ring uses a static (non-function) Style with stroke color/width", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      stroke: { mode: "solid", color: "#abcdef", width: 3 },
      label: null,
    });
    const ring = ringFeatures(layer)[0];
    const style = ring.getStyle();
    expect(typeof style).not.toBe("function");
    const stroke = (style as Style).getStroke()!;
    expect(stroke.getColor()).toBe("#abcdef");
    expect(stroke.getWidth()).toBe(3);
    expect(stroke.getLineDash()).toBeNull();
  });

  it("uses default stroke color 'red' and width 1.5", () => {
    const layer = createCircleLayer(CENTER, RADIUS, { label: null });
    const stroke = (ringFeatures(layer)[0].getStyle() as Style).getStroke()!;
    expect(stroke.getColor()).toBe("red");
    expect(stroke.getWidth()).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Dashed mode
// ---------------------------------------------------------------------------

describe("createCircleLayer — dashed", () => {
  it("static dashed (no dashSegmentPx) uses the configured dashLength/gapLength", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      stroke: { mode: "dashed", color: "blue", width: 2, dashLength: 10, gapLength: 5 },
      label: null,
    });
    const ring = ringFeatures(layer)[0];
    const style = ring.getStyle();
    expect(typeof style).not.toBe("function");
    expect((style as Style).getStroke()!.getLineDash()).toEqual([10, 5]);
  });

  it("dynamic dashed (with dashSegmentPx) uses a StyleFunction", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      stroke: { mode: "dashed", color: "blue", width: 2, dashSegmentPx: 50, dashGapRatio: 1 },
      label: null,
    });
    const ring = ringFeatures(layer)[0];
    const styleFn = getStyleFn(ring);
    expect(typeof styleFn).toBe("function");

    // Probe the style function at two different resolutions and confirm it
    // returns Styles with lineDash set to two positive numbers.
    const styleAtRes1 = (styleFn!(ring, 1) as Style[] | Style)!;
    const styleAtRes10 = (styleFn!(ring, 10) as Style[] | Style)!;
    const s1 = Array.isArray(styleAtRes1) ? styleAtRes1[0] : styleAtRes1;
    const s10 = Array.isArray(styleAtRes10) ? styleAtRes10[0] : styleAtRes10;
    const dash1 = (s1 as Style).getStroke()!.getLineDash()!;
    const dash10 = (s10 as Style).getStroke()!.getLineDash()!;
    expect(dash1).toHaveLength(2);
    expect(dash10).toHaveLength(2);
    expect(dash1[0]).toBeGreaterThan(0);
    expect(dash1[1]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Checkerboard mode
// ---------------------------------------------------------------------------

describe("createCircleLayer — checkerboard", () => {
  it("creates a single ring feature using a StyleFunction (multi-arc compositions)", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      stroke: { mode: "checkerboard", innerColor: "black", outerColor: "black" },
      label: null,
    });
    const rings = ringFeatures(layer);
    expect(rings).toHaveLength(1);
    const styleFn = getStyleFn(rings[0]);
    expect(typeof styleFn).toBe("function");
  });

  it("checkerboard style function returns several Styles (white backgrounds + arc segments)", () => {
    const layer = createCircleLayer(CENTER, RADIUS, {
      stroke: { mode: "checkerboard", segmentPx: 50 },
      label: null,
    });
    const ring = ringFeatures(layer)[0];
    const styleFn = getStyleFn(ring)!;
    const styles = styleFn(ring, 1) as Style[];
    expect(Array.isArray(styles)).toBe(true);
    // 2 white-background styles + segments * 2 (outer dash + inner gap arc)
    expect(styles.length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// Label feature
// ---------------------------------------------------------------------------

describe("createCircleLayer — label", () => {
  it("does NOT add a label when label is null", () => {
    const layer = createCircleLayer(CENTER, RADIUS, { label: null });
    expect(labelFeature(layer)).toBeUndefined();
  });

  it("adds a label feature with default position 'top' (offset +y by radius)", () => {
    const layer = createCircleLayer(CENTER, RADIUS);
    const label = labelFeature(layer)!;
    const point = label.getGeometry() as Point;
    expect(point.getCoordinates()).toEqual([0, RADIUS]);
  });

  it("places the label at the configured compass position", () => {
    type CompassPos = NonNullable<
      NonNullable<Parameters<typeof createCircleLayer>[2]>["label"]
    >["position"];

    const cases: { pos: CompassPos; expected: [number, number] }[] = [
      { pos: "bottom", expected: [0, -RADIUS] },
      { pos: "left", expected: [-RADIUS, 0] },
      { pos: "right", expected: [RADIUS, 0] },
    ];
    for (const c of cases) {
      const layer = createCircleLayer(CENTER, RADIUS, {
        label: { position: c.pos },
      });
      const point = labelFeature(layer)!.getGeometry() as Point;
      expect(point.getCoordinates()).toEqual(c.expected);
    }
  });

  it("auto-generates label text in km for radius >= 1000m", () => {
    const layer = createCircleLayer(CENTER, 2000);
    const label = labelFeature(layer)!;
    const styleFn = label.getStyleFunction()!;
    const style = styleFn(label, 0.0001) as Style; // very high zoom so label shows
    expect(style.getText()!.getText()).toBe("2km");
  });

  it("auto-generates label text in m for radius < 1000m", () => {
    const layer = createCircleLayer(CENTER, 250);
    const label = labelFeature(layer)!;
    const styleFn = label.getStyleFunction()!;
    const style = styleFn(label, 0.0001) as Style;
    expect(style.getText()!.getText()).toBe("250m");
  });

  it("respects an explicit label.text override", () => {
    const layer = createCircleLayer(CENTER, 1000, {
      label: { text: "Custom" },
    });
    const styleFn = labelFeature(layer)!.getStyleFunction()!;
    const style = styleFn(labelFeature(layer)!, 0.0001) as Style;
    expect(style.getText()!.getText()).toBe("Custom");
  });

  it("baseResolution gates the label by minZoom", () => {
    // baseResolution=1000 → at resolution=1000 zoom is 0; at resolution=1 zoom is ~10
    const layer = createCircleLayer(CENTER, 1000, {
      baseResolution: 1000,
      label: { minZoom: 6 },
    });
    const label = labelFeature(layer)!;
    const styleFn = label.getStyleFunction()!;
    // Below minZoom → undefined (label hidden)
    const hidden = styleFn(label, 1000); // zoom 0
    expect(hidden).toBeFalsy();
    // Above minZoom → returns a Style
    const visible = styleFn(label, 1); // zoom ~10
    expect(visible).toBeTruthy();
  });

  it("showLabelsRef={ current: false } hides the label", () => {
    const ref: { current: boolean } = { current: false };
    const layer = createCircleLayer(CENTER, 1000, {
      label: { showLabelsRef: ref },
    });
    const label = labelFeature(layer)!;
    const styleFn = label.getStyleFunction()!;
    expect(styleFn(label, 1)).toBeFalsy();

    // Toggle the ref → label appears
    ref.current = true;
    expect(styleFn(label, 1)).toBeTruthy();
  });
});

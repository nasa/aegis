/**
 * Browser-mode tests for `utils/styles/placeLabels.ts`.
 *
 * WHY BROWSER MODE?
 * `createPlaceLabelStyle()` paints to a real `<canvas>` (label box + composite
 * tether). jsdom can't render canvas, so the function returns undefined there.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import { Point, LineString } from "ol/geom";
import { Style, Icon } from "ol/style";
import { createPlaceLabelStyle } from "components/interface/map/testMapPerformant/placeLabels";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabelFeature(
  name: string | undefined,
  labelCoord: [number, number] = [0, 0],
  originalCoord?: [number, number]
): Feature {
  const f = new Feature(new Point(labelCoord));
  if (name !== undefined) f.set("name", name);
  if (originalCoord) f.set("originalCoordinates", originalCoord);
  return f;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPlaceLabelStyle", () => {
  it("returns undefined when feature has no name", () => {
    const fn = createPlaceLabelStyle();
    expect(fn(makeLabelFeature(undefined), 1)).toBeUndefined();
  });

  it("returns undefined when geometry is not a Point", () => {
    const fn = createPlaceLabelStyle();
    const f = new Feature(
      new LineString([
        [0, 0],
        [10, 0],
      ])
    );
    f.set("name", "Crater A");
    expect(fn(f, 1)).toBeUndefined();
  });

  it("returns a Style with an Icon image for an undragged feature", () => {
    const fn = createPlaceLabelStyle();
    const result = fn(makeLabelFeature("Crater A"), 1);
    expect(result).toBeInstanceOf(Style);
    expect((result as Style).getImage()).toBeInstanceOf(Icon);
  });

  it("reads label text from 'Feat Name' as well as 'name'", () => {
    const fn = createPlaceLabelStyle();
    const f = new Feature(new Point([0, 0]));
    f.set("Feat Name", "Tycho Crater");
    const result = fn(f, 1);
    expect(result).toBeInstanceOf(Style);
  });

  it("returns the SAME Style for identical names (cached by name)", () => {
    const fn = createPlaceLabelStyle();
    const a = fn(makeLabelFeature("Aristarchus", [0, 0]), 1) as Style;
    const b = fn(makeLabelFeature("Aristarchus", [50, 50]), 1) as Style;
    expect(a).toBe(b);
  });

  it("returns base Style when label is at exactly its original position (zero drag)", () => {
    const fn = createPlaceLabelStyle();
    const base = fn(makeLabelFeature("Copernicus", [0, 0]), 1) as Style;
    // dx=dy=0 → not considered dragged
    const same = fn(makeLabelFeature("Copernicus", [0, 0], [0, 0]), 1) as Style;
    expect(same).toBe(base);
  });

  it("returns a NEW composite Style when label is dragged (>1m offset)", () => {
    const fn = createPlaceLabelStyle();
    const base = fn(makeLabelFeature("Kepler", [0, 0]), 1) as Style;
    const dragged = fn(makeLabelFeature("Kepler", [100, 100], [0, 0]), 1) as Style;
    expect(dragged).not.toBe(base);
    expect(dragged.getImage()).toBeInstanceOf(Icon);
  });

  it("dragged Style image canvas is larger than the base label canvas (includes tether + dot)", () => {
    const fn = createPlaceLabelStyle();
    const baseImg = (fn(makeLabelFeature("Galileo"), 1) as Style).getImage() as Icon;
    const draggedImg = (
      fn(makeLabelFeature("Galileo", [200, 200], [0, 0]), 1) as Style
    ).getImage() as Icon;

    const baseCanvas = baseImg.getImage(1) as HTMLCanvasElement;
    const draggedCanvas = draggedImg.getImage(1) as HTMLCanvasElement;
    expect(draggedCanvas.width).toBeGreaterThan(baseCanvas.width);
    expect(draggedCanvas.height).toBeGreaterThan(baseCanvas.height);
  });

  it("zIndex is 100 for both base and dragged styles", () => {
    const fn = createPlaceLabelStyle();
    const base = fn(makeLabelFeature("Tsiolkovsky"), 1) as Style;
    const dragged = fn(makeLabelFeature("Tsiolkovsky", [50, 50], [0, 0]), 1) as Style;
    expect(base.getZIndex()).toBe(100);
    expect(dragged.getZIndex()).toBe(100);
  });
});

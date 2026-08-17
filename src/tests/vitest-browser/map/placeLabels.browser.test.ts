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
import { createGazetteerLabelStyle } from "components/interface/map/utils/styles/gazetteerLabels";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

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

describe("createGazetteerLabelStyle", () => {
  it("uses the configured label color without a background box", () => {
    const feature = new Feature(new Point([0, 0]));
    feature.set("Feat Name", "Nobile");
    const style = createGazetteerLabelStyle({
      ...defaultSublayerStyle,
      labelColor: "#ff0000",
      labelHaloColor: "#00ff00",
      labelHaloWidth: 1,
      labelHaloOpacity: 1,
    })(feature, 1) as Style;
    const canvas = (style.getImage() as Icon).getImage(1) as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasRedText = false;

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] === 255 && pixels[index + 1] === 0 && pixels[index + 2] === 0) {
        hasRedText = true;
        break;
      }
    }

    expect(hasRedText).toBe(true);
    expect(pixels[3]).toBe(0);
  });

  it("renders a black and white dashed tether after a label is moved", () => {
    const feature = new Feature(new Point([100, 100]));
    feature.set("label", "Nobile");
    feature.set("originalCoordinates", [0, 0]);
    const style = createGazetteerLabelStyle(defaultSublayerStyle)(feature, 1) as Style;
    const canvas = (style.getImage() as Icon).getImage(1) as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasBlack = false;
    let hasWhite = false;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red === 0 && green === 0 && blue === 0) hasBlack = true;
      if (red === 255 && green === 255 && blue === 255) hasWhite = true;
    }

    expect(hasBlack).toBe(true);
    expect(hasWhite).toBe(true);
  });

  it("ends the tether on the label's original location", () => {
    const dpr = window.devicePixelRatio || 1;
    const feature = new Feature(new Point([100, 100]));
    feature.set("label", "Nobile");
    feature.set("originalCoordinates", [0, 0]);
    const icon = (createGazetteerLabelStyle(defaultSublayerStyle)(feature, 1) as Style).getImage();
    const [anchorX, anchorY] = (icon as Icon).getAnchor();
    const canvas = (icon as Icon).getImage(1) as HTMLCanvasElement;

    // The image is anchored on the label's current position; the original location is
    // 100 map units to the west and 100 north of it, which at resolution 1 is 100 px
    // left and 100 px down in canvas space. The anchor dot must land exactly there.
    const dot = canvas
      .getContext("2d")!
      .getImageData(Math.round(anchorX - 100 * dpr), Math.round(anchorY + 100 * dpr), 1, 1).data;

    expect(dot[3]).toBeGreaterThan(0);
  });

  it("shows labels when showLabels is unset and hides them when it is false", () => {
    const feature = new Feature(new Point([0, 0]));
    feature.set("label", "Nobile");
    const withoutShowLabels: MapSublayerStyle = { ...defaultSublayerStyle };
    delete withoutShowLabels.showLabels;

    expect(createGazetteerLabelStyle(withoutShowLabels)(feature, 1)).toBeDefined();
    expect(
      createGazetteerLabelStyle({ ...defaultSublayerStyle, showLabels: false })(feature, 1)
    ).toBeUndefined();
  });
});

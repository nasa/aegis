/**
 * Browser-mode tests for `utils/styles/markerLabels.ts`.
 *
 * WHY BROWSER MODE?
 * `createMarkerLabelStyle()` paints a label box (rounded rect + text) to a
 * real `<canvas>` and uses `ctx.measureText()`. jsdom can't do either.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import type { Style } from "ol/style";
import { Icon, Circle as CircleStyle } from "ol/style";
import { createMarkerLabelStyle } from "components/interface/map/utils/styles/markerLabels";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabelFeature(overrides: {
  name?: string;
  labelType?: string;
  labelCoord?: [number, number];
  anchorCoord?: [number, number];
  labelOpacity?: number;
  accentColor?: string;
}): Feature {
  const f = new Feature(new Point(overrides.labelCoord ?? [0, 0]));
  if (overrides.name !== undefined) f.set("name", overrides.name);
  if (overrides.labelType) f.set("labelType", overrides.labelType);
  if (overrides.anchorCoord) f.set("anchorCoord", overrides.anchorCoord);
  if (overrides.labelOpacity !== undefined) f.set("labelOpacity", overrides.labelOpacity);
  if (overrides.accentColor) f.set("accentColor", overrides.accentColor);
  return f;
}

function asArray(s: Style | Style[] | undefined): Style[] {
  if (!s) return [];
  return Array.isArray(s) ? s : [s];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createMarkerLabelStyle", () => {
  it("returns undefined for a feature with no name", () => {
    const fn = createMarkerLabelStyle();
    expect(fn(makeLabelFeature({}), 1)).toBeUndefined();
  });

  it("returns a Style with an Icon for a label without anchorCoord", () => {
    const fn = createMarkerLabelStyle();
    const result = fn(makeLabelFeature({ name: "Station 1", labelType: "station" }), 1);
    const styles = asArray(result);
    expect(styles).toHaveLength(1);
    expect(styles[0].getImage()).toBeInstanceOf(Icon);
  });

  it("returns connector + dot + label styles when anchorCoord is far from label", () => {
    const fn = createMarkerLabelStyle();
    const result = fn(
      makeLabelFeature({
        name: "Station 1",
        labelType: "station",
        labelCoord: [0, 0],
        anchorCoord: [200, 200],
      }),
      1
    );
    const styles = asArray(result);
    // Expect 4 styles: connectorBg, connectorFg, anchorDot, labelStyle
    expect(styles).toHaveLength(4);
    // The anchor dot uses a CircleStyle image
    const dotStyle = styles.find((s) => s.getImage() instanceof CircleStyle);
    expect(dotStyle).toBeDefined();
    // Two connector strokes (LineString geometries)
    const connectorStyles = styles.filter((s) => {
      const g = s.getGeometry();
      if (!g || typeof g === "function" || typeof g === "string") return false;
      return g.getType() === "LineString";
    });
    expect(connectorStyles).toHaveLength(2);
    // The label image
    const labelStyle = styles.find((s) => s.getImage() instanceof Icon);
    expect(labelStyle).toBeDefined();
  });

  it("skips connector when label is within 2px of anchor", () => {
    const fn = createMarkerLabelStyle();
    const result = fn(
      makeLabelFeature({
        name: "Station 1",
        labelType: "station",
        labelCoord: [0, 0],
        anchorCoord: [1, 1], // within 2 px at resolution=1
      }),
      1
    );
    const styles = asArray(result);
    expect(styles).toHaveLength(1); // just the label
  });

  it("uses higher zIndex for lander than station than POI", () => {
    const fn = createMarkerLabelStyle();
    const lander = asArray(
      fn(makeLabelFeature({ name: "Lander", labelType: "lander" }), 1)
    )[0].getZIndex()!;
    const station = asArray(
      fn(makeLabelFeature({ name: "Station", labelType: "station" }), 1)
    )[0].getZIndex()!;
    const poi = asArray(fn(makeLabelFeature({ name: "POI", labelType: "poi" }), 1))[0].getZIndex()!;

    expect(lander).toBeGreaterThan(station);
    expect(station).toBeGreaterThan(poi);
  });

  it("falls back to station colors for unknown labelType", () => {
    const fn = createMarkerLabelStyle();
    const known = asArray(
      fn(makeLabelFeature({ name: "X", labelType: "station" }), 1)
    )[0].getImage() as Icon;
    const unknown = asArray(
      fn(makeLabelFeature({ name: "X", labelType: "no-such-type" }), 1)
    )[0].getImage() as Icon;
    // Both look up the same baseLabelCache key for the canvas image
    // (text/bg colors are identical for station fallback). Sanity-check that
    // the returned image is a defined Icon.
    expect(known).toBeInstanceOf(Icon);
    expect(unknown).toBeInstanceOf(Icon);
  });

  it("applies labelOpacity to the icon image", () => {
    const fn = createMarkerLabelStyle();
    const result = fn(
      makeLabelFeature({ name: "Faded", labelType: "station", labelOpacity: 0.4 }),
      1
    );
    const styles = asArray(result);
    const labelIcon = styles.find((s) => s.getImage() instanceof Icon)!.getImage() as Icon;
    expect(labelIcon.getOpacity()).toBeCloseTo(0.4);
  });

  it("respects custom font size", () => {
    const small = createMarkerLabelStyle(10);
    const large = createMarkerLabelStyle(24);
    const smallStyle = asArray(
      small(makeLabelFeature({ name: "Hello", labelType: "station" }), 1)
    )[0];
    const largeStyle = asArray(
      large(makeLabelFeature({ name: "Hello", labelType: "station" }), 1)
    )[0];
    const smallImg = (smallStyle.getImage() as Icon).getImage(1) as HTMLCanvasElement;
    const largeImg = (largeStyle.getImage() as Icon).getImage(1) as HTMLCanvasElement;
    expect(largeImg.height).toBeGreaterThan(smallImg.height);
  });

  it("draws an accent border when the feature carries accentColor", () => {
    const fn = createMarkerLabelStyle();
    const plainIcon = asArray(
      fn(makeLabelFeature({ name: "Rover", labelType: "asset" }), 1)
    )[0].getImage() as Icon;
    const accentIcon = asArray(
      fn(makeLabelFeature({ name: "Rover", labelType: "asset", accentColor: "#ff0000" }), 1)
    )[0].getImage() as Icon;

    const plainCtx = (plainIcon.getImage(1) as HTMLCanvasElement).getContext("2d")!;
    const accentCtx = (accentIcon.getImage(1) as HTMLCanvasElement).getContext("2d")!;
    const midY = Math.floor(plainCtx.canvas.height / 2);
    const plainPx = Array.from(plainCtx.getImageData(1, midY, 1, 1).data);
    const accentPx = Array.from(accentCtx.getImageData(1, midY, 1, 1).data);

    // The left border edge is opaque accent red; the plain label is the
    // translucent dark background there. Also proves the cache key separates
    // accent variants of the same name+type.
    expect(accentPx).toEqual([255, 0, 0, 255]);
    expect(plainPx).not.toEqual(accentPx);
    expect(plainPx[3]).toBeLessThan(255);
  });

  it("asset config overrides the asset label font size and box colors", () => {
    const fn = createMarkerLabelStyle(14, 1.5, {
      iconSize: 20,
      clickable: false,
      hoverable: false,
      labelsEnabled: true,
      labelFontSize: 24,
      labelFontWeight: "normal",
      labelTextColor: "rgba(0,255,0,1)",
      labelBgColor: "rgba(0,0,255,0.5)",
      labelAccentBorder: true,
      labelAccentBorderWidth: 2,
    });
    const assetCanvas = (
      asArray(fn(makeLabelFeature({ name: "Rover", labelType: "asset" }), 1))[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;
    const stationCanvas = (
      asArray(
        fn(makeLabelFeature({ name: "Rover", labelType: "station" }), 1)
      )[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;

    // The per-mode font size applies to asset labels only
    expect(assetCanvas.height).toBeGreaterThan(stationCanvas.height);

    // Box background uses the configured bgColor (corner pixel, inside the
    // rounded rect and clear of the text glyphs)
    const px = Array.from(assetCanvas.getContext("2d")!.getImageData(2, 2, 1, 1).data);
    expect(px[0]).toBeLessThan(50);
    expect(px[2]).toBeGreaterThan(200);
    expect(px[3]).toBeLessThan(200);
  });

  it("asset labelAccentBorder: false suppresses the accent border", () => {
    const fn = createMarkerLabelStyle(14, 1.5, {
      iconSize: 20,
      clickable: false,
      hoverable: false,
      labelsEnabled: true,
      labelFontSize: 14,
      labelFontWeight: "normal",
      labelTextColor: "rgba(255,236,170,0.95)",
      labelBgColor: "rgba(0,0,0,0.5)",
      labelAccentBorder: false,
      labelAccentBorderWidth: 2,
    });
    const withAccentCanvas = (
      asArray(
        fn(makeLabelFeature({ name: "Rover", labelType: "asset", accentColor: "#ff0000" }), 1)
      )[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;
    const plainCanvas = (
      asArray(fn(makeLabelFeature({ name: "Rover", labelType: "asset" }), 1))[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;

    const midY = Math.floor(plainCanvas.height / 2);
    const accentPx = Array.from(
      withAccentCanvas.getContext("2d")!.getImageData(1, midY, 1, 1).data
    );
    const plainPx = Array.from(plainCanvas.getContext("2d")!.getImageData(1, midY, 1, 1).data);

    // The feature still carries accentColor, but the config turns the border off
    expect(accentPx).toEqual(plainPx);
    expect(plainPx[3]).toBeLessThan(255);
  });

  it("asset labelAccentBorderWidth widens the accent border", () => {
    const makeFn = (width: number) =>
      createMarkerLabelStyle(14, 1.5, {
        iconSize: 20,
        clickable: false,
        hoverable: false,
        labelsEnabled: true,
        labelFontSize: 14,
        labelFontWeight: "normal",
        labelTextColor: "rgba(255,236,170,0.95)",
        labelBgColor: "rgba(0,0,0,0.5)",
        labelAccentBorder: true,
        labelAccentBorderWidth: width,
      });
    const wideCanvas = (
      asArray(
        makeFn(4)(
          makeLabelFeature({ name: "Rover", labelType: "asset", accentColor: "#ff0000" }),
          1
        )
      )[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;
    const narrowCanvas = (
      asArray(
        makeFn(2)(
          makeLabelFeature({ name: "Rover", labelType: "asset", accentColor: "#ff0000" }),
          1
        )
      )[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;

    // Width 4 covers pixel 2 outright; width 2 leaves it as background there
    const midY = Math.floor(wideCanvas.height / 2);
    const widePx = Array.from(wideCanvas.getContext("2d")!.getImageData(2, midY, 1, 1).data);
    const narrowPx = Array.from(narrowCanvas.getContext("2d")!.getImageData(2, midY, 1, 1).data);
    expect(widePx).toEqual([255, 0, 0, 255]);
    expect(narrowPx).toEqual([0, 0, 0, 128]);
  });

  it("asset bold renders a wider text box", () => {
    const makeFn = (fontWeight: string) =>
      createMarkerLabelStyle(14, 1.5, {
        iconSize: 20,
        clickable: false,
        hoverable: false,
        labelsEnabled: true,
        labelFontSize: 14,
        labelFontWeight: fontWeight,
        labelTextColor: "rgba(255,236,170,0.95)",
        labelBgColor: "rgba(0,0,0,0.5)",
        labelAccentBorder: true,
        labelAccentBorderWidth: 2,
      });
    const plainCanvas = (
      asArray(
        makeFn("normal")(makeLabelFeature({ name: "Rover", labelType: "asset" }), 1)
      )[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;
    const boldCanvas = (
      asArray(
        makeFn("bold")(makeLabelFeature({ name: "Rover", labelType: "asset" }), 1)
      )[0].getImage() as Icon
    ).getImage(1) as HTMLCanvasElement;

    // Bold glyphs are wider, so the box is wider; the height is unchanged
    expect(boldCanvas.width).toBeGreaterThan(plainCanvas.width);
    expect(boldCanvas.height).toBe(plainCanvas.height);
  });
});

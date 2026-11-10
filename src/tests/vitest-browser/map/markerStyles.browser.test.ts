/**
 * Browser-mode tests for `utils/styles/markers.ts`.
 *
 * WHY BROWSER MODE?
 * The marker style builders call `renderEmojiToCanvas()`, which paints to a
 * real `<canvas>` 2D context. jsdom's canvas getContext returns null, so the
 * styles can't be exercised there.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import { Style, Icon, Circle as CircleStyle } from "ol/style";
import {
  buildStationStyleFunction,
  buildPoiStyleFunction,
  buildActionStyleFunction,
  buildAssetStyleFunction,
  buildLanderStyle,
} from "components/interface/map/utils/styles/markers";
import { MODE_CONFIGS } from "components/interface/map/utils/modeConfig";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(uuid: string, props: Record<string, unknown> = {}): Feature {
  const f = new Feature(new Point([0, 0]));
  f.setId(uuid);
  for (const [k, v] of Object.entries(props)) f.set(k, v);
  return f;
}

function getIconStyle(styles: Style[]): Style | undefined {
  return styles.find((s) => s.getImage() instanceof Icon);
}

describe("custom emoji markers", () => {
  it.each([
    ["station", "/images/station.svg"],
    ["landerIcon", "/images/lander.svg"],
  ])("loads %s as an image for assets and stations", async (emoji, src) => {
    const builders = [
      buildAssetStyleFunction("custom", 20),
      buildAssetStyleFunction(null, 34),
      buildStationStyleFunction(MODE_CONFIGS.editor, null, []),
      buildStationStyleFunction(MODE_CONFIGS.dashboard, null, []),
      buildPoiStyleFunction(null),
      buildActionStyleFunction(null),
    ];
    for (const builder of builders) {
      const feature = makeFeature("custom", { emoji });
      const styles = builder(feature, 1);
      const icon = getIconStyle(styles)!.getImage() as Icon;
      expect(icon.getSrc()).toContain(src);
      icon.load();
      await icon.ready();
      const image = icon.getImage(1) as HTMLImageElement;
      expect(image).toBeInstanceOf(HTMLImageElement);
      expect(image.naturalWidth).toBeGreaterThan(0);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 40;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 40, 40);
      const pixels = ctx.getImageData(0, 0, 40, 40).data;
      expect(pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      expect(builder(feature, 1)).toBe(styles);
    }
  });

  it("keeps Unicode assets on a canvas and preserves selection outlines", () => {
    const builder = buildAssetStyleFunction("selected");
    const styles = builder(makeFeature("selected", { emoji: "1f680" }), 1);
    const icon = getIconStyle(styles)!.getImage() as Icon;
    expect(icon.getImage(1)).toBeInstanceOf(HTMLCanvasElement);
    expect(styles.some((style) => style.getImage() instanceof CircleStyle)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildStationStyleFunction
// ---------------------------------------------------------------------------

describe("buildStationStyleFunction", () => {
  it("uses the station icon at 20×20 px (editor mode)", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.editor, null, []);
    const styles = fn(makeFeature("s1", { emoji: "1f4cd" }), 1);
    const icon = getIconStyle(styles)!.getImage() as Icon;
    expect(icon.getSize()).toEqual([20, 20]);
  });

  it("selected station gets zIndex 9999", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.editor, "s1", []);
    const styles = fn(makeFeature("s1", { emoji: "1f4cd" }), 1);
    expect(getIconStyle(styles)!.getZIndex()).toBe(9999);
  });

  it("non-selected station uses stationZIndexOffset + feature.zIndex", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.editor, null, []);
    const styles = fn(makeFeature("s1", { emoji: "1f4cd", zIndex: 7 }), 1);
    expect(getIconStyle(styles)!.getZIndex()).toBe(MODE_CONFIGS.editor.station.zIndexOffset + 7);
  });

  it("dashboard in-progress station gets a green CircleStyle ring", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.dashboard, null, ["s1"]);
    const styles = fn(makeFeature("s1", { emoji: "1f4cd" }), 1);
    const circleStyle = styles.find((s) => s.getImage() instanceof CircleStyle);
    expect(circleStyle).toBeDefined();
    const stroke = (circleStyle!.getImage() as CircleStyle).getStroke()!;
    expect(stroke.getColor()).toBe("#52f075");
  });

  it("editor station with same uuid in stationsInProgress does NOT get the ring (stationHoverable=true)", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.editor, null, ["s1"]);
    const styles = fn(makeFeature("s1", { emoji: "1f4cd" }), 1);
    const circleStyle = styles.find((s) => s.getImage() instanceof CircleStyle);
    expect(circleStyle).toBeUndefined();
  });

  it("falls back to default emoji 2754 (?) when emoji property is missing", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.editor, null, []);
    const styles = fn(makeFeature("s1"), 1);
    expect(getIconStyle(styles)).toBeDefined();
  });

  it("caches identical inputs (returns same Style array reference)", () => {
    const fn = buildStationStyleFunction(MODE_CONFIGS.editor, null, []);
    const a = fn(makeFeature("s1", { emoji: "1f4cd" }), 1);
    const b = fn(makeFeature("s1", { emoji: "1f4cd" }), 1);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// buildPoiStyleFunction
// ---------------------------------------------------------------------------

describe("buildPoiStyleFunction", () => {
  it("selected POI gets zIndex 9999, others get 0", () => {
    const fnSelected = buildPoiStyleFunction("p1");
    const fnUnselected = buildPoiStyleFunction(null);
    expect(getIconStyle(fnSelected(makeFeature("p1", { emoji: "1f534" }), 1))!.getZIndex()).toBe(
      9999
    );
    expect(getIconStyle(fnUnselected(makeFeature("p1", { emoji: "1f534" }), 1))!.getZIndex()).toBe(
      0
    );
  });

  it("falls back to default emoji 1f534 when missing", () => {
    const fn = buildPoiStyleFunction(null);
    expect(getIconStyle(fn(makeFeature("p1"), 1))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildActionStyleFunction
// ---------------------------------------------------------------------------

describe("buildActionStyleFunction", () => {
  it("selected action gets zIndex 9999", () => {
    const fn = buildActionStyleFunction("a1");
    const styles = fn(makeFeature("a1", { emoji: "2754" }), 1);
    expect(getIconStyle(styles)!.getZIndex()).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// buildLanderStyle
// ---------------------------------------------------------------------------

describe("buildLanderStyle", () => {
  it("returns a Style with an SVG-source Icon", () => {
    const style = buildLanderStyle(40);
    expect(style).toBeInstanceOf(Style);
    const icon = style.getImage() as Icon;
    expect(icon).toBeInstanceOf(Icon);
    // getSize() reads natural image size and is null until the SVG loads;
    // verifying the configured src is enough to confirm the Style is wired up.
    expect(icon.getSrc()).toContain("/images/lander.svg");
  });

  it("caches by size — same size returns identical Style reference", () => {
    const a = buildLanderStyle(36);
    const b = buildLanderStyle(36);
    expect(a).toBe(b);
  });

  it("different sizes produce different Style instances", () => {
    const small = buildLanderStyle(24);
    const large = buildLanderStyle(48);
    expect(small).not.toBe(large);
  });
});

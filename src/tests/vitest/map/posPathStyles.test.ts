/**
 * Tests for `utils/styles/posPath.ts` — `buildPosPathStyleFunction()`.
 *
 * The POS path style reads `color` and `opacity` from the feature's
 * properties (set by `PosEntries` behavior) and renders a base line plus
 * arrow decorators spaced along the path.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import { LineString } from "ol/geom";
import type { Point } from "ol/geom";
import type { Style } from "ol/style";
import type Icon from "ol/style/Icon";
import { buildPosPathStyleFunction } from "components/interface/map/utils/styles/posPath";

function makeFeature(coords: [number, number][], props: Record<string, unknown> = {}): Feature {
  const f = new Feature(new LineString(coords));
  for (const [k, v] of Object.entries(props)) f.set(k, v);
  return f;
}

function isArrow(s: Style): boolean {
  const g = s.getGeometry();
  if (!g || typeof g === "function" || typeof g === "string") return false;
  return g.getType() === "Point" && !!s.getImage();
}

describe("buildPosPathStyleFunction", () => {
  it("returns at minimum a base stroke styled with the feature color", () => {
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature(
      [
        [0, 0],
        [10, 0],
      ],
      { color: "#ff8800" }
    );
    const styles = fn(feat, 1);
    const stroke = styles[0].getStroke()!;
    // Color must flow through from the per-feature property with default opacity applied.
    // Default opacity is 0.6, so #ff8800 → rgba(255,136,0,0.6).
    expect(stroke.getColor()).toBe("rgba(255,136,0,0.6)");
    expect(stroke.getWidth()).toBeGreaterThan(0);
  });

  it("defaults the stroke width to 2px", () => {
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature(
      [
        [0, 0],
        [10, 0],
      ],
      { color: "#ff8800" }
    );
    expect(fn(feat, 1)[0].getStroke()!.getWidth()).toBe(2);
  });

  it("applies the provided weight to the stroke width", () => {
    const fn = buildPosPathStyleFunction(5);
    const feat = makeFeature(
      [
        [0, 0],
        [10, 0],
      ],
      { color: "#ff8800" }
    );
    expect(fn(feat, 1)[0].getStroke()!.getWidth()).toBe(5);
  });

  it("falls back to default color #888 when no color property", () => {
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature([
      [0, 0],
      [10, 0],
    ]);
    const styles = fn(feat, 1);
    // Default color #888 with default opacity 0.6 → rgba(136,136,136,0.6)
    expect(styles[0].getStroke()!.getColor()).toBe("rgba(136,136,136,0.6)");
  });

  it("returns an empty array when feature has no geometry", () => {
    const fn = buildPosPathStyleFunction();
    const feat = new Feature();
    const styles = fn(feat, 1);
    expect(styles).toEqual([]);
  });

  it("places arrow decorators along the line at ARROW_REPEAT * resolution intervals", () => {
    const fn = buildPosPathStyleFunction();
    // Long line so multiple arrows fit; resolution=1 → spacing = 100 map units
    const coords: [number, number][] = [
      [0, 0],
      [500, 0],
    ];
    const feat = makeFeature(coords, { color: "#00ff00" });
    const styles = fn(feat, 1);
    const arrows = styles.filter(isArrow);
    // 500-unit segment, 100-unit spacing → 5 arrows
    expect(arrows.length).toBe(5);
  });

  it("places fewer arrows at higher resolution (zoomed-out spacing increases)", () => {
    const fn = buildPosPathStyleFunction();
    const coords: [number, number][] = [
      [0, 0],
      [500, 0],
    ];
    const feat = makeFeature(coords, { color: "#00ff00" });
    const arrowsLowRes = fn(feat, 1).filter(isArrow);
    // Use a fresh feature to avoid the cached previous styles being returned;
    // cache key includes resolution so this is fine, but be safe.
    const arrowsHighRes = fn(feat, 5).filter(isArrow);
    expect(arrowsHighRes.length).toBeLessThan(arrowsLowRes.length);
  });

  it("respects per-feature opacity on arrow icons", () => {
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature(
      [
        [0, 0],
        [500, 0],
      ],
      { color: "#ff0000", opacity: 0.4 }
    );
    const styles = fn(feat, 1);
    const arrow = styles.find(isArrow);
    expect(arrow!.getImage()!.getOpacity()).toBeCloseTo(0.4);
  });

  it("renders arrows at scale 1, sized by the arrowSize param (like traverses)", () => {
    const coords: [number, number][] = [
      [0, 0],
      [500, 0],
    ];
    // weight 5, arrowSize 16 (proportional to the traverse ratio for the mode).
    const arrow = buildPosPathStyleFunction(5, 16)(
      makeFeature(coords, { color: "#ff0000" }),
      1
    ).find(isArrow);
    const img = arrow!.getImage() as Icon;
    // Arrows scale 1 — the icon's own pixel size carries the proportional sizing,
    // matching how traverse arrows render.
    expect(img.getScale()).toBe(1);
    // The chevron SVG encodes the requested size in its data URI.
    expect(decodeURIComponent(img.getSrc()!)).toContain('width="16"');
  });

  it("does not leave stale arrows behind when a path changes with the same point count", () => {
    // Regression: the style function previously cached the whole style array
    // (including baked arrow Point geometries) keyed by coord *count* — not by
    // coordinate values. Reusing the same builder for a different 2-point path
    // at the same color/opacity/weight/resolution returned the old arrows,
    // leaving chevrons frozen at the previous crew positions.
    const fn = buildPosPathStyleFunction();

    const first = makeFeature(
      [
        [0, 0],
        [500, 0],
      ],
      { color: "#00ff00" }
    );
    const firstArrow = fn(first, 1).find(isArrow)!;
    const firstX = (firstArrow.getGeometry() as Point).getCoordinates()[0];

    // Different path, same point count / color / resolution → must recompute.
    const second = makeFeature(
      [
        [1000, 1000],
        [1500, 1000],
      ],
      { color: "#00ff00" }
    );
    const secondArrow = fn(second, 1).find(isArrow)!;
    const secondX = (secondArrow.getGeometry() as Point).getCoordinates()[0];

    // Arrows must sit on the second path, not the first.
    expect(secondX).toBeGreaterThanOrEqual(1000);
    expect(secondX).not.toBe(firstX);
  });

  it("defaults arrow opacity to 0.6 when no opacity property", () => {
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature(
      [
        [0, 0],
        [500, 0],
      ],
      { color: "#ff0000" }
    );
    const arrow = fn(feat, 1).find(isArrow);
    expect(arrow!.getImage()!.getOpacity()).toBeCloseTo(0.6);
  });

  it("draws no arrow on a zero-length path", () => {
    // Regression: a REX seeds every initial crew position at the same egress
    // coordinate, so the path collapses to a single point. The midpoint
    // fallback used to place a stray chevron there with an arbitrary angle.
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature(
      [
        [100, 100],
        [100, 100],
      ],
      { color: "#ff00ff" }
    );
    expect(fn(feat, 1).filter(isArrow)).toHaveLength(0);
  });

  it("still draws a fallback arrow on a short but non-zero path", () => {
    const fn = buildPosPathStyleFunction();
    const feat = makeFeature(
      [
        [0, 0],
        [5, 0],
      ],
      { color: "#00ff00" }
    );
    expect(fn(feat, 1).filter(isArrow)).toHaveLength(1);
  });
});

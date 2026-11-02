/**
 * Tests for `utils/bearingAnchors.ts` and the "Along Path" bearing mode of
 * `buildTraverseStyleFunction`.
 */

import { describe, expect, it } from "vitest";
import Feature from "ol/Feature";
import { LineString } from "ol/geom";

import {
  BEARING_LABEL_MIN_SPACING_PX,
  buildBearingAnchors,
  thinBearingAnchors,
} from "components/interface/map/utils/bearingAnchors";
import { buildTraverseStyleFunction } from "components/interface/map/utils/styles/polylines";

// Small local patch near the equator: 1e-5° ≈ 0.30 m on the Moon.
const R = 1737400;
const M = 1 / ((Math.PI / 180) * R);
const toMapCoord = (p: AEGISPoint) => [p.lng / M, p.lat / M];
const opts = { radius: R, usingLGRSCoordinates: false, toMapCoord };

/** A path from (0,0) in metres; `x` east, `y` north. */
function pathFromMeters(points: [number, number][]): AEGISPoint[] {
  return points.map(([x, y]) => ({ lat: y * M, lng: x * M }));
}

/** A 1 m pixel stair-step heading north-east, then due east. */
function stairStepPath(): AEGISPoint[] {
  const pts: [number, number][] = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 40; i++) {
    if (i % 2 === 0) x += 1;
    else y += 1;
    pts.push([x, y]);
  }
  for (let i = 0; i < 40; i++) {
    x += 1;
    pts.push([x, y]);
  }
  return pathFromMeters(pts);
}

describe("buildBearingAnchors", () => {
  it("spaces anchors evenly and skips the path ends", () => {
    const anchors = buildBearingAnchors(
      pathFromMeters([
        [0, 0],
        [100, 0],
      ]),
      opts
    );
    expect(anchors).toHaveLength(10);
    const xs = anchors.map((a) => a.coord[0]);
    expect(xs[0]).toBeCloseTo(5, 0);
    expect(xs[xs.length - 1]).toBeCloseTo(95, 0);
    for (const a of anchors) expect(a.bearing).toBeCloseTo(90, 0);
  });

  it("smooths a stair-step into a steady bearing and follows a real turn", () => {
    const anchors = buildBearingAnchors(stairStepPath(), opts);
    const diagonal = anchors.filter((a) => a.coord[0] > 4 && a.coord[0] < 12);
    const east = anchors.filter((a) => a.coord[0] > 34);
    expect(diagonal.length).toBeGreaterThan(0);
    expect(east.length).toBeGreaterThan(0);
    for (const a of diagonal) expect(Math.abs(a.bearing - 45)).toBeLessThan(6);
    for (const a of east) expect(Math.abs(a.bearing - 90)).toBeLessThan(1);
  });

  it("places one centred anchor on a short path and none on a tiny one", () => {
    const short = buildBearingAnchors(
      pathFromMeters([
        [0, 0],
        [14, 0],
      ]),
      opts
    );
    expect(short).toHaveLength(1);
    expect(short[0].coord[0]).toBeCloseTo(7, 0);
    expect(
      buildBearingAnchors(
        pathFromMeters([
          [0, 0],
          [8, 0],
        ]),
        opts
      )
    ).toHaveLength(0);
  });
});

describe("thinBearingAnchors", () => {
  const anchors = buildBearingAnchors(
    pathFromMeters([
      [0, 0],
      [1000, 0],
    ]),
    opts
  );

  it.each([0.1, 0.5, 1, 4])("keeps labels at least the minimum spacing apart (res %s)", (res) => {
    const min = BEARING_LABEL_MIN_SPACING_PX * res;
    const kept = thinBearingAnchors(anchors, min);
    expect(kept.length).toBeGreaterThan(0);
    for (let i = 1; i < kept.length; i++) {
      expect(kept[i].mapDistance - kept[i - 1].mapDistance).toBeGreaterThanOrEqual(min - 1e-9);
    }
  });
});

describe("buildTraverseStyleFunction along-path bearings", () => {
  const baseOpts = {
    weight: 3,
    selectedWeight: 8,
    showArrows: false,
    showBearings: true,
    showDistances: false,
    arrowSize: 12,
    arrowRepeat: 50,
    bearingLabelFontSize: 11,
    bearingLabelColor: "#ffcc00",
    distanceLabelFontSize: 12,
    distanceLabelColor: "#ffffff",
    getColor: () => "#3399cc",
    getIsSelected: () => false,
  };

  function bearingLabelCount(feature: Feature, mode: TraverseBearingMode, res: number) {
    const styles = buildTraverseStyleFunction({ ...baseOpts, bearingMode: mode })(feature, res);
    return styles.filter((s) => s.getText()?.getText()?.toString().includes("°")).length;
  }

  it("uses the thinned anchors instead of one label per segment", () => {
    const path = stairStepPath();
    const feature = new Feature(new LineString(path.map(toMapCoord)));
    feature.set("bearingAnchors", buildBearingAnchors(path, opts));
    expect(bearingLabelCount(feature, "segment", 0.01)).toBe(80);
    // ~68 m of path: one label at 1 px/m (120 m spacing), several when zoomed in.
    expect(bearingLabelCount(feature, "path", 1)).toBe(1);
    expect(bearingLabelCount(feature, "path", 0.1)).toBeGreaterThan(3);
  });

  it("falls back to per-segment labels when a feature has no anchors", () => {
    const feature = new Feature(
      new LineString([
        [0, 0],
        [100, 0],
        [200, 100],
      ])
    );
    expect(bearingLabelCount(feature, "path", 1)).toBe(2);
  });
});

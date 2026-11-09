import {
  pathSegmentDistances,
  simplifyPath,
  simplifyPathToEndpoints,
} from "utils/mapping/simplifyPath";

const MOON = 1_737_400;
/** Metres per degree of latitude on the Moon. */
const M_PER_DEG = (Math.PI / 180) * MOON;
const ORIGIN: AEGISPoint = { lat: 0, lng: 0 };
/** A point `east` and `north` metres from the origin (at the equator). */
const at = (east: number, north: number): AEGISPoint => ({
  lat: north / M_PER_DEG,
  lng: east / M_PER_DEG,
});

describe("simplifyPath", () => {
  it("drops collinear and within-tolerance vertices, keeping the ends", () => {
    const path = [ORIGIN, at(10, 0.2), at(20, -0.3), at(30, 0.1), at(40, 0)];
    expect(simplifyPath(path, 0.5, MOON)).toEqual([path[0], path[4]]);
  });

  it("keeps a corner beyond the tolerance", () => {
    const path = [ORIGIN, at(10, 0), at(20, 10), at(10, 20), at(0, 20)];
    const simplified = simplifyPath(path, 0.5, MOON);
    expect(simplified).toEqual([path[0], path[1], path[2], path[3], path[4]]);
    expect(simplifyPath(path, 100, MOON)).toEqual([path[0], path[4]]);
  });

  it("handles a loop whose ends coincide", () => {
    const path = [ORIGIN, at(10, 0), at(10, 10), ORIGIN];
    expect(simplifyPath(path, 0.5, MOON).length).toBeGreaterThan(2);
  });

  it("copies short paths and never mutates its input", () => {
    const path = [ORIGIN, at(1, 0)];
    const copy = simplifyPath(path, 0.5, MOON);
    expect(copy).toEqual(path);
    expect(copy[0]).not.toBe(path[0]);
  });
});

describe("simplifyPathToEndpoints", () => {
  it("snaps the ends to the given points", () => {
    const start = at(0.01, 0.01);
    const end = at(40.01, 0);
    expect(simplifyPathToEndpoints([ORIGIN, at(20, 0), at(40, 0)], 0.5, MOON, start, end)).toEqual([
      start,
      end,
    ]);
  });

  it("falls back to the two ends for a degenerate path", () => {
    expect(simplifyPathToEndpoints([ORIGIN], 0.5, MOON, ORIGIN, at(5, 0))).toEqual([
      ORIGIN,
      at(5, 0),
    ]);
  });
});

describe("pathSegmentDistances", () => {
  it("measures each segment", () => {
    const distances = pathSegmentDistances([ORIGIN, at(30, 0), at(30, 40)], MOON);
    expect(distances[0]).toBeCloseTo(30, 3);
    expect(distances[1]).toBeCloseTo(40, 3);
    expect(pathSegmentDistances([ORIGIN], MOON)).toEqual([]);
  });
});

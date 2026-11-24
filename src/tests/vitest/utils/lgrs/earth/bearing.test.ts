import { getGridBearingInCrs, getLgrsGridBearing } from "utils/lgrs/bearing";
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";

const acc = getEarthGridSystem("lunar-acc");
const mgrs = getEarthGridSystem("mgrs");
const a = new Float64Array(2);
const b = new Float64Array(2);

/** Planar bearing from `origin` to `destination` in `crs`, clockwise from grid north. */
function planarBearing(origin: AEGISPoint, destination: AEGISPoint, crs: LgrsCrsId): number {
  acc.projectLatLon(origin.lat, origin.lng, crs, a);
  acc.projectLatLon(destination.lat, destination.lng, crs, b);
  const degrees = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

// A segment across the 14/15 zone boundary (96° W) in Texas.
const west: AEGISPoint = { lat: 30, lng: -96.2 };
const east: AEGISPoint = { lat: 30.1, lng: -95.8 };

describe("Earth grid bearings", () => {
  test("use the origin's zone across the 14/15 boundary", () => {
    const eastward = getLgrsGridBearing(acc, west, east);
    const westward = getLgrsGridBearing(acc, east, west);
    expect(eastward).toBeCloseTo(planarBearing(west, east, acc.classifyLatLon(30, -99)), 9);
    expect(westward).toBeCloseTo(planarBearing(east, west, acc.classifyLatLon(30, -93)), 9);
    expect(eastward).toBe(getGridBearingInCrs(acc, west, east, acc.classifyLatLon(30, -99)));
    // The zones' grid norths differ by the convergence change across the boundary.
    const reversed = (westward + 180) % 360;
    expect(Math.abs(eastward - reversed)).toBeGreaterThan(2.5);
    expect(Math.abs(eastward - reversed)).toBeLessThan(3.5);
  });

  test("are the same in both label schemes", () => {
    expect(getLgrsGridBearing(mgrs, west, east)).toBe(getLgrsGridBearing(acc, west, east));
    expect(getLgrsGridBearing(mgrs, east, west)).toBe(getLgrsGridBearing(acc, east, west));
  });

  test("include the grid convergence, and use the UPS cap for an origin past 84° N", () => {
    const due = getLgrsGridBearing(acc, { lat: 29.5, lng: -95 }, { lat: 29.6, lng: -95 });
    // West of the central meridian, true north lies east of grid north by about Δλ·sin φ.
    expect(due).toBeCloseTo(2 * Math.sin((29.55 * Math.PI) / 180), 2);
    const origin: AEGISPoint = { lat: 84.1, lng: 0 };
    const destination: AEGISPoint = { lat: 83.9, lng: 0 };
    expect(getLgrsGridBearing(acc, origin, destination)).toBeCloseTo(
      planarBearing(origin, destination, acc.classifyLatLon(85, 0)),
      9
    );
  });

  test("are NaN for invalid points and 0 for a zero-length segment", () => {
    expect(getLgrsGridBearing(acc, { lat: 91, lng: 0 }, east)).toBeNaN();
    expect(getLgrsGridBearing(acc, west, { lat: NaN, lng: 0 })).toBeNaN();
    expect(getLgrsGridBearing(acc, west, { lat: 0, lng: Infinity })).toBeNaN();
    expect(getLgrsGridBearing(acc, null, east)).toBeNaN();
    expect(getLgrsGridBearing(acc, west, west)).toBe(0);
  });
});

import { formatSouthLpsCoordinate, type LgrsPrecision } from "utils/lgrs/dynamicGrid";
import {
  getSouthLpsDisplayCoordinate,
  latLonToSouthLps,
  parseSouthLpsLabel,
  southLpsToLatLon,
} from "utils/lgrs/southLps";

// Points on both halves of the grid, near and away from the pole.
const POINTS: AEGISPoint[] = [
  { lat: -89.5, lng: 45.2 },
  { lat: -89.9, lng: -120.7 },
  { lat: -85.3, lng: 170.1 },
  { lat: -88.25, lng: -10.05 },
  { lat: -84.01, lng: 0 },
  { lat: -89.99, lng: 90 },
];

describe("southLpsToLatLon", () => {
  test.each(POINTS)("inverts latLonToSouthLps at %o", (point) => {
    const lps = latLonToSouthLps(point);
    const back = southLpsToLatLon(lps);
    const again = latLonToSouthLps(back);
    expect(again[0]).toBeCloseTo(lps[0], 6);
    expect(again[1]).toBeCloseTo(lps[1], 6);
  });

  test("maps the pole and rejects coordinates outside the domain", () => {
    expect(southLpsToLatLon([500000, 500000]).lat).toBeCloseTo(-90, 9);
    expect(southLpsToLatLon([5_000_000, 500000])).toBeNull();
  });
});

describe("parseSouthLpsLabel", () => {
  const precisions: LgrsPrecision[] = [1, 10, 100, 1000];

  test.each(POINTS)("round-trips full labels at every precision for %o", (point) => {
    for (const precision of precisions) {
      const label = formatSouthLpsCoordinate(latLonToSouthLps(point), precision);
      const parsed = parseSouthLpsLabel(label.acc);
      expect(parsed).not.toBeNull();
      // The parsed point is the centre of the named cell, so it formats to the same label.
      expect(formatSouthLpsCoordinate(latLonToSouthLps(parsed), precision).acc).toBe(label.acc);
      const [easting, northing] = latLonToSouthLps(parsed);
      expect(Math.abs(easting - (label.lowerLeft[0] + precision / 2))).toBeLessThan(1e-6);
      expect(Math.abs(northing - (label.lowerLeft[1] + precision / 2))).toBeLessThan(1e-6);
    }
  });

  test.each(POINTS)("accepts the spaced display forms for %o", (point) => {
    const full = getSouthLpsDisplayCoordinate(point, "full");
    const condensed = getSouthLpsDisplayCoordinate(point, "condensed");
    const fromFull = parseSouthLpsLabel(full);
    expect(getSouthLpsDisplayCoordinate(fromFull, "full")).toBe(full);
    // The condensed form has no 25 km area, so it resolves near a reference point.
    const fromCondensed = parseSouthLpsLabel(condensed.toLowerCase(), point);
    expect(getSouthLpsDisplayCoordinate(fromCondensed, "full")).toBe(full);
  });

  test("rejects malformed labels", () => {
    expect(parseSouthLpsLabel("")).toBeNull();
    expect(parseSouthLpsLabel("hello")).toBeNull();
    expect(parseSouthLpsLabel("BKL K12 L3")).toBeNull(); // unequal digit counts
    expect(parseSouthLpsLabel("BKL I12 L34")).toBeNull(); // I is not an LGRS letter
    expect(parseSouthLpsLabel("K12 L34")).toBeNull(); // condensed needs a reference
  });
});

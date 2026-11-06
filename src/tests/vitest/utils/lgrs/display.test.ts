import { formatLgrsFromLatLon, LGRS_DISPLAY_PRECISION_METERS } from "utils/lgrs/display";
import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";

function point(lat: number, lng: number): AEGISPoint {
  return { lat, lng };
}

describe("formatLgrsFromLatLon", () => {
  test.each([
    [0, 0, "-00 -00", "23NFF -00 -00"],
    [-0.0001, 0.0001, "-00 Z99", "23MFE -00 Z99"],
    [45, 90, "S84 N71", "34TGQ S84 N71"],
    [-45, -90, "G15 L28", "12GDR G15 L28"],
    [79.9, 10, "K62 V59", "24XFG K62 V59"],
    [8, 4, "D91 S92", "24PAV D91 S92"],
    [0, -180, "C72 -00", "1NAA C72 -00"],
    [80, 10, "B47 B40", "ZCA B47 B40"],
    [-80, 10, "B47 X59", "BCZ B47 X59"],
    [-89, -133, "B95 D44", "AZM B95 D44"],
  ])("formats %f, %f as %s / %s (plan example table)", (lat, lng, condensed, full) => {
    expect(formatLgrsFromLatLon(moonGridSystem, point(lat, lng), 10, "condensed")).toBe(condensed);
    expect(formatLgrsFromLatLon(moonGridSystem, point(lat, lng), 10, "full")).toBe(full);
  });

  test("displays at 10 m", () => {
    expect(LGRS_DISPLAY_PRECISION_METERS).toBe(10);
  });

  test("uses the point's own latitude for the LTM band (point semantics)", () => {
    // The 10 m boxes of these points straddle an 8° band parallel; the oracle labels the point.
    expect(
      formatLgrsFromLatLon(moonGridSystem, point(7.999999997298345, 98.21537110092487), 10, "full")
    ).toBe("35NHQ R47 S52");
    expect(
      formatLgrsFromLatLon(moonGridSystem, point(8.000000076486206, -159.8278792515216), 10, "full")
    ).toBe("3PFV E16 S34");
  });

  test("returns null for a missing or invalid point", () => {
    expect(formatLgrsFromLatLon(moonGridSystem, null, 10, "full")).toBeNull();
    expect(formatLgrsFromLatLon(moonGridSystem, undefined, 10, "condensed")).toBeNull();
    expect(formatLgrsFromLatLon(moonGridSystem, point(Number.NaN, 0), 10, "full")).toBeNull();
    expect(formatLgrsFromLatLon(moonGridSystem, point(-91, 0), 10, "condensed")).toBeNull();
    expect(formatLgrsFromLatLon(moonGridSystem, point(0, 400), 10, "condensed")).toBeNull();
  });

  test("returns the prefix alone at 25 km", () => {
    expect(formatLgrsFromLatLon(moonGridSystem, point(0, 0), 25000, "full")).toBe("23NFF");
    expect(formatLgrsFromLatLon(moonGridSystem, point(0, 0), 25000, "condensed")).toBe("23NFF");
  });
});

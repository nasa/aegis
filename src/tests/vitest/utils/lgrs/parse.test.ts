import { classifyLatLon, getLtmCentralMeridian } from "utils/lgrs/crs";
import { formatLgrsFromLatLon } from "utils/lgrs/display";
import { formatLatLonAsLgrs } from "utils/lgrs/format";
import { isPartialLgrsLabel, parseLgrsLabel } from "utils/lgrs/parse";
import { projectLatLon } from "utils/lgrs/projection";

const POLAR_POINTS = [-89.5, -85.3, -80, 80, 85.3, 89.5].flatMap((lat) =>
  [-170.1, -45.2, 0, 45.2, 170.1].map((lng) => ({ lat, lng }))
);
const LTM_POINTS = Array.from({ length: 45 }, (_, index) => index + 1).flatMap((zone) =>
  [-79.999999, ...Array.from({ length: 19 }, (_, i) => (i - 9) * 8), -0.0001, 79.999999].flatMap(
    (lat) => [-4, 0, 3.9999].map((offset) => ({ lat, lng: getLtmCentralMeridian(zone) + offset }))
  )
);
const PRECISIONS: LgrsPrecision[] = [1, 10, 100, 1000, 25000];

describe("parseLgrsLabel", () => {
  // These labels are lgrs 0.4.0 oracle examples also used by the formatter tests.
  test.each([
    [0, 0, "23NFF-00-00"],
    [45, 90, "34TGQS84N71"],
    [-45, -90, "12GDRG15L28"],
    [79.9, 10, "24XFGK62V59"],
    [8, 4, "24PAVD91S92"],
    [0, -180, "1NAAC72-00"],
    [80, 10, "ZCAB47B40"],
    [-80, 10, "BCZB47X59"],
    [-89, -133, "AZMB95D44"],
  ] as const)("locates the oracle point %s, %s in cell %s", (lat, lng, label) => {
    const parsed = parseLgrsLabel(label);
    expect(parsed).not.toBeNull();
    const crs = classifyLatLon(lat, lng);
    const original = new Float64Array(2);
    const decoded = new Float64Array(2);
    projectLatLon(lat, lng, crs, original);
    projectLatLon(parsed.lat, parsed.lng, crs, decoded);
    expect(Math.abs(original[0] - decoded[0])).toBeLessThan(10);
    expect(Math.abs(original[1] - decoded[1])).toBeLessThan(10);
  });

  test.each(POLAR_POINTS)("round-trips full labels across both poles at %o", (point) => {
    for (const precision of PRECISIONS) {
      const label = formatLatLonAsLgrs(point.lat, point.lng, precision, "acc");
      expect(label).not.toBeNull();
      const parsed = parseLgrsLabel(label);
      expect(parsed, label).not.toBeNull();
      expect(formatLatLonAsLgrs(parsed.lat, parsed.lng, precision, "acc")).toBe(label);
    }
  });

  test.each(LTM_POINTS)("round-trips every LTM zone and hemisphere at %o", (point) => {
    for (const precision of PRECISIONS) {
      const label = formatLatLonAsLgrs(point.lat, point.lng, precision, "acc");
      expect(label).not.toBeNull();
      const parsed = parseLgrsLabel(label);
      expect(parsed, label).not.toBeNull();
      expect(formatLatLonAsLgrs(parsed.lat, parsed.lng, precision, "acc")).toBe(label);
    }
  });

  test.each([
    { lat: -89.5, lng: 45.2 },
    { lat: 89.5, lng: -45.2 },
    { lat: 45, lng: 90 },
    { lat: -45, lng: -90 },
    { lat: 0, lng: -180 },
    { lat: 79.9, lng: 179.9 },
  ])("resolves spaced, lowercase and condensed labels near %o", (point) => {
    const full = formatLgrsFromLatLon(point, 10, "full");
    const condensed = formatLgrsFromLatLon(point, 10, "condensed");
    for (const label of [full, full.toLowerCase(), condensed.toLowerCase()]) {
      const parsed = parseLgrsLabel(label, point);
      expect(parsed).not.toBeNull();
      expect(formatLgrsFromLatLon(parsed, 10, "full")).toBe(full);
    }
  });

  test.each([
    "",
    "hello",
    "BKL K12 L3",
    "BKL I12 L34",
    "K12 L34", // condensed needs a reference
    "0NFF -00 -00",
    "46NFF -00 -00",
    "23IFF -00 -00",
    "23NZZ -00 -00",
    "23CFF -00 -00", // a north-hemisphere cell cannot use a southern band
    "BZA -00 -00", // outside the polar domain
  ])("rejects invalid labels: %s", (label) => {
    expect(parseLgrsLabel(label)).toBeNull();
  });
});

describe("isPartialLgrsLabel", () => {
  test.each([
    "",
    "B",
    "BK",
    "BKL",
    "Y",
    "Z",
    "ZC",
    "ZCA B4",
    "1",
    "23",
    "23N",
    "23NF",
    "23NFF",
    "23NFF -",
    "23NFF -00 -",
    "K",
    "K1",
    "K12 L",
  ])("accepts partial LPS, LTM and condensed labels: %s", (label) => {
    expect(isPartialLgrsLabel(label)).toBe(true);
  });

  test.each(["46N", "0N", "23I", "23NZ", "K12 34", "BKL I12 L34", "K1234", "hello"])(
    "rejects impossible syntax: %s",
    (label) => {
      expect(isPartialLgrsLabel(label)).toBe(false);
    }
  );
});

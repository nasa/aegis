import { LPS_DOMAIN_RADIUS } from "utils/lgrs/constants";
import { getLtmCrsId, LGRS_CRS_LPS_NORTH, LGRS_CRS_LPS_SOUTH } from "utils/lgrs/crs";
import { formatLatLonAsLgrs, formatLgrs, formatLgrsLabel } from "utils/lgrs/format";
import { projectLatLon } from "utils/lgrs/projection";

const out = new Float64Array(2);

describe("formatLatLonAsLgrs", () => {
  // lgrs 0.4.0 oracle examples (plan §4.3).
  test.each([
    [0, 0, "23NFF-00-00"],
    [-0.0001, 0.0001, "23MFE-00Z99"],
    [45, 90, "34TGQS84N71"],
    [-45, -90, "12GDRG15L28"],
    [79.9, 10, "24XFGK62V59"],
    [8, 4, "24PAVD91S92"],
    [0, -180, "1NAAC72-00"],
    [80, 10, "ZCAB47B40"],
    [-80, 10, "BCZB47X59"],
    [-89, -133, "AZMB95D44"],
  ] as const)("formats %s, %s as %s", (lat, lon, acc) => {
    expect(formatLatLonAsLgrs(lat, lon, 10, "acc")).toBe(acc);
  });

  // Python lgrs 0.4.0 results for points within millimetres of the equator.
  test.each([
    [-1e-9, 0.0001, "23MFF-00-00"],
    [-3.2977886216808065e-8, 1, "23MGFE29-00"],
    [-5e-11, 3, "23MJFQ92-00"],
  ] as const)("matches the oracle next to the equator at %s, %s", (lat, lon, acc) => {
    expect(formatLatLonAsLgrs(lat, lon, 10, "acc")).toBe(acc);
  });

  test("formats every precision in both kinds", () => {
    expect(formatLatLonAsLgrs(45, 90, 25000, "lgrs")).toBe("34TGQ");
    expect(formatLatLonAsLgrs(45, 90, 25000, "acc")).toBe("34TGQ");
    expect(formatLatLonAsLgrs(45, 90, 1000, "acc")).toBe("34TGQSN");
    expect(formatLatLonAsLgrs(45, 90, 100, "acc")).toBe("34TGQS8N7");
    expect(formatLatLonAsLgrs(45, 90, 1, "acc")).toBe("34TGQS840N715");
    expect(formatLatLonAsLgrs(45, 90, 1, "lgrs")).toBe("34TGQ1784013715");
    expect(formatLatLonAsLgrs(45, 90, 10, "lgrs")).toBe("34TGQ17841371");
  });

  test("returns null for invalid input", () => {
    expect(formatLatLonAsLgrs(91, 0, 10, "acc")).toBeNull();
    expect(formatLatLonAsLgrs(Number.NaN, 0, 10, "acc")).toBeNull();
    expect(formatLatLonAsLgrs(0, Number.POSITIVE_INFINITY, 10, "acc")).toBeNull();
  });

  test("conforms longitude", () => {
    expect(formatLatLonAsLgrs(10, 182, 10, "acc")).toBe(formatLatLonAsLgrs(10, -178, 10, "acc"));
  });
});

describe("formatLgrs", () => {
  test("rejects a supplied latitude outside the LTM hemisphere band", () => {
    const crs = getLtmCrsId(23, "N");
    expect(formatLgrs(250000, 0, crs, 10, "acc", 0)).toBe("23NFF-00-00");
    expect(formatLgrs(250000, 0, crs, 10, "acc", -1e-9)).toBeNull();
    expect(formatLgrs(250000, 0, crs, 10, "acc", 80)).toBeNull();
  });

  test("derives the latitude band by inverse when it is omitted", () => {
    const crs = getLtmCrsId(24, "N");
    projectLatLon(8.5, 4, crs, out);
    expect(formatLgrs(out[0], out[1], crs, 10, "acc")).toBe(
      formatLgrs(out[0], out[1], crs, 10, "acc", 8.5)
    );
    expect(formatLgrs(out[0], out[1], crs, 10, "acc")?.slice(0, 3)).toBe("24P");
  });

  test("keeps the hemisphere strict at the equator", () => {
    expect(formatLgrs(250000, 2500000, getLtmCrsId(23, "S"), 10, "acc")).toBeNull();
    expect(formatLgrs(250000, -0.001, getLtmCrsId(23, "N"), 10, "acc")).toBeNull();
    expect(formatLgrs(250000, 0, getLtmCrsId(23, "N"), 10, "acc")).toBe("23NFF-00-00");
    expect(formatLgrs(250000, 2499990, getLtmCrsId(23, "S"), 10, "acc")).toBe("23MFE-00Z99");
    expect(formatLgrsLabel(250000, 2500000, getLtmCrsId(23, "S"), 10)).toBeNull();
  });

  test("rejects LTM coordinates outside the zone when no latitude is given", () => {
    projectLatLon(0, 5, getLtmCrsId(23, "N"), out);
    expect(formatLgrs(out[0], out[1], getLtmCrsId(23, "N"), 10, "acc")).toBeNull();
  });

  test("starts the next easting area on an exact west-half 25 km line", () => {
    expect(formatLgrs(475000, 500000, LGRS_CRS_LPS_SOUTH, 10, "acc")).toBe("AZN-00-00");
    expect(formatLgrs(475000, 500000, LGRS_CRS_LPS_NORTH, 1, "lgrs")).toBe("YZN0000000000");
  });

  test("rejects coordinates outside the LPS circle", () => {
    expect(formatLgrs(500000 + LPS_DOMAIN_RADIUS + 1, 500000, LGRS_CRS_LPS_SOUTH, 10, "acc")).toBe(
      null
    );
    expect(formatLgrs(500000, 500000, -1, 10, "acc")).toBeNull();
  });
});

describe("formatLgrsLabel", () => {
  test("labels the south box at its centre like the original port", () => {
    expect(formatLgrsLabel(499999.999, 500000, LGRS_CRS_LPS_SOUTH, 10)).toEqual({
      lgrs: "AZN24990000",
      acc: "AZNZ99-00",
      prefix: "AZN",
      condensed: "Z99-00",
      text: "Z99 -00",
      lowerLeft: [499990, 500000],
      precision: 10,
    });
  });

  test("mirrors the band letters in the north", () => {
    expect(formatLgrsLabel(499999.999, 500000, LGRS_CRS_LPS_NORTH, 10)?.acc).toBe("YZNZ99-00");
    expect(formatLgrsLabel(500000, 500000, LGRS_CRS_LPS_NORTH, 10)?.acc).toBe("ZAN-00-00");
  });

  test("labels LTM boxes with a 4–5 character prefix", () => {
    const label = formatLgrsLabel(250000, 0, getLtmCrsId(23, "N"), 1000);
    expect(label).toMatchObject({ acc: "23NFF--", prefix: "23NFF", condensed: "--", text: "- -" });
    expect(formatLgrsLabel(130000, 0, getLtmCrsId(4, "N"), 25000)).toMatchObject({
      lgrs: "4NAA",
      acc: "4NAA",
      text: "4NAA",
      lowerLeft: [125000, 0],
    });
  });

  test("labels across the equator consistently", () => {
    const north = formatLgrsLabel(250005, 5, getLtmCrsId(23, "N"), 10);
    const south = formatLgrsLabel(250005, 2499995, getLtmCrsId(23, "S"), 10);
    expect(north?.acc).toBe("23NFF-00-00");
    expect(south?.acc).toBe("23MFE-00Z99");
  });

  test("accepts the zone edges and rejects points beyond them", () => {
    const crs = getLtmCrsId(23, "N");
    projectLatLon(10, -4, crs, out);
    expect(formatLgrsLabel(out[0], out[1], crs, 10)).not.toBeNull();
    projectLatLon(10, -4.001, crs, out);
    expect(formatLgrsLabel(out[0], out[1], crs, 10)).toBeNull();
    projectLatLon(80.001, 0, crs, out);
    expect(formatLgrsLabel(out[0], out[1], crs, 10)).toBeNull();
  });
});

import {
  classifyLatLon,
  conformLongitude,
  formatCrsName,
  getCrsHemisphere,
  getCrsLatitudeLimits,
  getLpsCrsId,
  getLtmCentralMeridian,
  getLtmCrsId,
  getLtmZone,
  getLtmZoneLongitudeLimits,
  isLpsCrs,
  isLtmCrs,
  isValidCrs,
  LGRS_CRS_INVALID,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "utils/lgrs/crs";
import { projectLatLon, unprojectToLatLon } from "utils/lgrs/projection";

import { createSeededRandom } from "../../helpers/seededRandom";

const out = new Float64Array(2);
const back = new Float64Array(2);

describe("LGRS CRS ids", () => {
  test("encodes LPS and LTM zone/hemisphere ids", () => {
    expect(getLpsCrsId("S")).toBe(0);
    expect(getLpsCrsId("N")).toBe(1);
    expect(getLtmCrsId(1, "N")).toBe(2);
    expect(getLtmCrsId(1, "S")).toBe(3);
    expect(getLtmCrsId(23, "N")).toBe(46);
    expect(getLtmCrsId(45, "S")).toBe(91);
    expect(getLtmCrsId(46, "N")).toBe(LGRS_CRS_INVALID);
    expect(getLtmCrsId(0, "N")).toBe(LGRS_CRS_INVALID);
  });

  test("decodes ids", () => {
    expect(getLtmZone(getLtmCrsId(34, "S"))).toBe(34);
    expect(getLtmZone(LGRS_CRS_LPS_SOUTH)).toBe(0);
    expect(getCrsHemisphere(getLtmCrsId(34, "S"))).toBe("S");
    expect(getCrsHemisphere(LGRS_CRS_LPS_NORTH)).toBe("N");
    expect(isLpsCrs(0) && isLpsCrs(1) && !isLpsCrs(2)).toBe(true);
    expect(isLtmCrs(2) && isLtmCrs(91) && !isLtmCrs(92) && !isLtmCrs(1)).toBe(true);
    expect(isValidCrs(-1) || isValidCrs(92) || isValidCrs(1.5)).toBe(false);
  });

  test("formats CRS names", () => {
    expect(formatCrsName(getLtmCrsId(23, "N"))).toBe("23N");
    expect(formatCrsName(getLtmCrsId(4, "S"))).toBe("4S");
    expect(formatCrsName(LGRS_CRS_LPS_SOUTH)).toBe("LPS S");
    expect(formatCrsName(LGRS_CRS_LPS_NORTH)).toBe("LPS N");
    expect(formatCrsName(-1)).toBe("");
  });

  test("describes zone geometry", () => {
    expect(getLtmCentralMeridian(1)).toBe(-176);
    expect(getLtmCentralMeridian(23)).toBe(0);
    expect(getLtmCentralMeridian(45)).toBe(176);
    expect(getLtmZoneLongitudeLimits(23)).toEqual([-4, 4]);
    expect(getCrsLatitudeLimits(getLtmCrsId(23, "S"))).toEqual([-80, 0]);
    expect(getCrsLatitudeLimits(LGRS_CRS_LPS_NORTH)).toEqual([80, 90]);
  });
});

describe("classifyLatLon", () => {
  test.each([
    [0, 0, getLtmCrsId(23, "N")],
    [-0.0001, 0.0001, getLtmCrsId(23, "S")],
    [0, -180, getLtmCrsId(1, "N")],
    [0, 179.999999, getLtmCrsId(45, "N")],
    [0, 180, getLtmCrsId(1, "N")],
    [0, 182, getLtmCrsId(1, "N")],
    [0, -4, getLtmCrsId(23, "N")],
    [0, -4.000001, getLtmCrsId(22, "N")],
    [79.999999, 0, getLtmCrsId(23, "N")],
    [80, 0, LGRS_CRS_LPS_NORTH],
    [-80, 0, LGRS_CRS_LPS_SOUTH],
    [-79.999999, 0, getLtmCrsId(23, "S")],
    [90, 0, LGRS_CRS_LPS_NORTH],
    [-90, 0, LGRS_CRS_LPS_SOUTH],
  ])("classifies %s, %s as %s", (lat, lon, crs) => {
    expect(classifyLatLon(lat, lon)).toBe(crs);
  });

  test("rejects invalid coordinates like lgrs", () => {
    expect(classifyLatLon(90.1, 0)).toBe(LGRS_CRS_INVALID);
    expect(classifyLatLon(Number.NaN, 0)).toBe(LGRS_CRS_INVALID);
    expect(classifyLatLon(0, 360.5)).toBe(LGRS_CRS_INVALID);
    expect(classifyLatLon(0, -720)).toBe(LGRS_CRS_INVALID);
    expect(classifyLatLon(0, 360)).toBe(getLtmCrsId(23, "N"));
  });

  test("conforms longitudes to [-180, 180)", () => {
    expect(conformLongitude(180)).toBe(-180);
    expect(conformLongitude(-180)).toBe(-180);
    expect(conformLongitude(182)).toBe(-178);
    expect(conformLongitude(-190)).toBe(170);
    expect(conformLongitude(360)).toBe(0);
  });
});

describe("projectLatLon / unprojectToLatLon", () => {
  test("projects the LTM origin and false origins", () => {
    expect(projectLatLon(0, 0, getLtmCrsId(23, "N"), out)).toBe(true);
    expect([out[0], out[1]]).toEqual([250000, 0]);
    expect(projectLatLon(0, 8, getLtmCrsId(24, "S"), out)).toBe(true);
    expect([out[0], out[1]]).toEqual([250000, 2500000]);
    expect(projectLatLon(-90, 0, LGRS_CRS_LPS_SOUTH, out)).toBe(true);
    expect([out[0], out[1]]).toEqual([500000, 500000]);
    expect(projectLatLon(90, 0, LGRS_CRS_LPS_NORTH, out)).toBe(true);
    expect([out[0], out[1]]).toEqual([500000, 500000]);
  });

  test("mirrors north LPS", () => {
    projectLatLon(-85, 30, LGRS_CRS_LPS_SOUTH, out);
    projectLatLon(85, 30, LGRS_CRS_LPS_NORTH, back);
    expect(back[0]).toBeCloseTo(out[0], 6);
    expect(back[1] - 500000).toBeCloseTo(-(out[1] - 500000), 6);
  });

  test("projects into a neighbouring zone", () => {
    expect(projectLatLon(10, 5, getLtmCrsId(23, "N"), out)).toBe(true);
    expect(out[0]).toBeGreaterThan(375000);
  });

  test("rejects invalid input and singular points", () => {
    expect(projectLatLon(91, 0, 0, out)).toBe(false);
    expect(projectLatLon(0, Number.NaN, 0, out)).toBe(false);
    expect(projectLatLon(0, 0, -1, out)).toBe(false);
    expect(projectLatLon(0, 90, getLtmCrsId(23, "N"), out)).toBe(false);
    expect(unprojectToLatLon(Number.NaN, 0, 0, out)).toBe(false);
    expect(unprojectToLatLon(0, 0, 92, out)).toBe(false);
  });

  test("round-trips random points in their own CRS", () => {
    const random = createSeededRandom(12345);
    let worstLat = 0;
    let worstLon = 0;
    for (let index = 0; index < 5000; index++) {
      const lat = -89.9 + random() * 179.8;
      const lon = -180 + random() * 360;
      const crs = classifyLatLon(lat, lon);
      expect(projectLatLon(lat, lon, crs, out)).toBe(true);
      expect(unprojectToLatLon(out[0], out[1], crs, back)).toBe(true);
      worstLat = Math.max(worstLat, Math.abs(back[0] - lat));
      const dLon = Math.abs(((back[1] - lon + 540) % 360) - 180);
      worstLon = Math.max(worstLon, dLon * Math.cos((lat * Math.PI) / 180));
    }
    // ≈ 1e-9° is 0.03 mm on the ground; PROJ's acos/asin forms limit LTM near the equator.
    expect(worstLat).toBeLessThan(1e-9);
    expect(worstLon).toBeLessThan(1e-9);
  });

  test("returns the LPS pole longitude as 0", () => {
    unprojectToLatLon(500000, 500000, LGRS_CRS_LPS_NORTH, out);
    expect([out[0], out[1]]).toEqual([90, 0]);
  });
});

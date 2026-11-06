import {
  computeMgrsParts,
  formatCanonicalMgrs,
  formatMgrs,
  formatMgrsBoxLabel,
  getEarthBoxBandLetter,
  getEarthPointBandLetter,
  getMgrsSquareId,
} from "utils/lgrs/earth/mgrs";
import { projectEarthLatLon, unprojectEarthToLatLon } from "utils/lgrs/earth/projection";
import {
  classifyEarthLatLon,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getEarthLatitudeBandLetter,
  getUtmCrsId,
} from "utils/lgrs/earth/zones";

import { createSeededRandom } from "../../../helpers/seededRandom";

const out = new Float64Array(2);
const utm = (zone: number, hemisphere: LgrsHemisphere = "N") => getUtmCrsId(zone, hemisphere);
const compact = (mgrs: string | null) => mgrs?.replace(/ /g, "");

describe("formatCanonicalMgrs", () => {
  // Plan §3.4 worked examples.
  test.each([
    [29.5593, -95.09, "15R TN 9751 7177"],
    [29.25, -103.25, "13R FN 7005 3695"],
    [64.8, -17.0, "28W DS 0499 8766"],
    [0.0001, -179.9999, "1N AA 6603 0001"],
  ] as const)("formats %s, %s as %s at 10 m", (lat, lon, mgrs) => {
    expect(formatCanonicalMgrs(lat, lon, 10)).toBe(mgrs);
  });

  // PyPI `mgrs` 1.5 (GeoTrans) at 1 m, with GeoTrans's zero-padded zone removed.
  test.each([
    [29.5593, -95.09, "15RTN9751671776"],
    [29.25, -103.25, "13RFN7005236953"],
    [64.8, -17.0, "28WDS0499487665"],
    [0.0001, -179.9999, "1NAA6603200011"],
    [-33.8688, 151.2093, "56HLH3436850948"],
    [-45.0, 177.5, "60GWR3940716928"],
    [60.39, 5.32, "32VKN9723000510"],
    [58.0, 2.0, "31VDE4089229147"],
    [78.22, 15.65, "33XWG1481383004"],
    [79.0, 8.0, "31XFH0638074533"],
    [80.0, 25.0, "35XMJ6123582252"],
    [80.0, 40.0, "37XEJ1938481752"],
    [83.9, -60.0, "21XVP6442417856"],
    [-79.9, 30.0, "36CVS4129228062"],
    [85.0, -45.0, "YUD0723207232"],
    [85.0, 45.0, "ZFD9276707232"],
    [87.3, -120.0, "YXJ4035049908"],
    [-85.0, -45.0, "AUR0723292767"],
    [-85.0, 45.0, "BFR9276792767"],
    [-80.5, -100.0, "AKL5900716444"],
    [-88.0, 160.0, "BAK7595291323"],
    [90.0, 0.0, "ZAH0000000000"],
    [-90.0, 0.0, "BAN0000000000"],
  ] as const)("matches GeoTrans at %s, %s (%s)", (lat, lon, mgrs) => {
    expect(compact(formatCanonicalMgrs(lat, lon, 1))).toBe(mgrs);
  });

  test("puts exactly 84° N in UPS (GeoTrans keeps it in UTM 60X)", () => {
    expect(formatCanonicalMgrs(84, 179, 1)).toBe("Z AP 11636 66626");
  });

  test("formats every precision", () => {
    expect(formatCanonicalMgrs(29.5593, -95.09, 100000)).toBe("15R TN");
    expect(formatCanonicalMgrs(29.5593, -95.09, 10000)).toBe("15R TN 9 7");
    expect(formatCanonicalMgrs(29.5593, -95.09, 1000)).toBe("15R TN 97 71");
    expect(formatCanonicalMgrs(29.5593, -95.09, 100)).toBe("15R TN 975 717");
    expect(formatCanonicalMgrs(29.5593, -95.09, 10)).toBe("15R TN 9751 7177");
    expect(formatCanonicalMgrs(29.5593, -95.09, 1)).toBe("15R TN 97516 71776");
    expect(formatCanonicalMgrs(90, 0, 10)).toBe("Z AH 0000 0000");
    expect(formatCanonicalMgrs(90, 0, 100000)).toBe("Z AH");
  });

  test("truncates rather than rounds", () => {
    // Northing 7,187,665.84 → 87665 at 1 m, 8766 at 10 m.
    expect(formatCanonicalMgrs(64.8, -17.0, 1)).toBe("28W DS 04994 87665");
    // Easting 539,407.649 → 39407.
    expect(formatCanonicalMgrs(-45.0, 177.5, 1)).toBe("60G WR 39407 16928");
  });

  test("handles the equator and the antimeridian", () => {
    expect(formatCanonicalMgrs(0, -93, 10)).toBe("15N WA 0000 0000");
    expect(formatCanonicalMgrs(-1e-12, -93, 10)).toBe("15M WV 0000 9999");
    expect(formatCanonicalMgrs(0, 180, 10)).toBe(formatCanonicalMgrs(0, -180, 10));
    expect(formatCanonicalMgrs(0, 180, 10)?.startsWith("1N ")).toBe(true);
  });

  test("names the zone after the exceptions", () => {
    expect(formatCanonicalMgrs(60, 4, 10)?.startsWith("32V ")).toBe(true);
    expect(formatCanonicalMgrs(60, 2.9, 10)?.startsWith("31V ")).toBe(true);
    expect(formatCanonicalMgrs(64, 4, 10)?.startsWith("31W ")).toBe(true);
    expect(formatCanonicalMgrs(72, 8, 10)?.startsWith("31X ")).toBe(true);
    expect(formatCanonicalMgrs(72, 9, 10)?.startsWith("33X ")).toBe(true);
    expect(formatCanonicalMgrs(71.9, 8, 10)?.startsWith("32W ")).toBe(true);
  });

  test("returns null for invalid input", () => {
    expect(formatCanonicalMgrs(NaN, 0, 10)).toBeNull();
    expect(formatCanonicalMgrs(91, 0, 10)).toBeNull();
    expect(formatCanonicalMgrs(0, 0, 25000 as EarthMgrsPrecision)).toBeNull();
  });
});

describe("100 km square IDs", () => {
  test("cycles the column sets and offsets the rows of even zones", () => {
    expect(getMgrsSquareId(utm(1), 100000, 0)).toBe("AA");
    expect(getMgrsSquareId(utm(2), 100000, 0)).toBe("JF");
    expect(getMgrsSquareId(utm(3), 100000, 0)).toBe("SA");
    expect(getMgrsSquareId(utm(4), 100000, 0)).toBe("AF");
    expect(getMgrsSquareId(utm(1), 899999.9, 1999999.9)).toBe("HV");
    expect(getMgrsSquareId(utm(2), 899999.9, 1999999.9)).toBe("RE");
    expect(getMgrsSquareId(utm(1), 899999.9, 2000000)).toBe("HA");
    expect(getMgrsSquareId(utm(60, "S"), 500000, 9999999)).toBe("WE");
  });

  test("owns [k·100 km, (k+1)·100 km)", () => {
    expect(getMgrsSquareId(utm(15), 300000, 3200000)).toBe("UN");
    expect(getMgrsSquareId(utm(15), 299999.999999, 3199999.999999)).toBe("TM");
  });

  test("rejects eastings outside the lettered columns", () => {
    expect(getMgrsSquareId(utm(15), 99999.999, 3200000)).toBeNull();
    expect(getMgrsSquareId(utm(15), 900000, 3200000)).toBeNull();
    expect(getMgrsSquareId(utm(15), NaN, 3200000)).toBeNull();
    expect(getMgrsSquareId(-1, 500000, 3200000)).toBeNull();
  });

  test("uses the polar tables in UPS", () => {
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 800000, 800000)).toBe("JA");
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 1999999, 3199999)).toBe("ZZ");
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 2000000, 2000000)).toBe("AN");
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 3199999, 800000)).toBe("RA");
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 799999, 2000000)).toBeNull();
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 3200000, 2000000)).toBeNull();
    expect(getMgrsSquareId(EARTH_CRS_UPS_SOUTH, 2000000, 3200000)).toBeNull();
    expect(getMgrsSquareId(EARTH_CRS_UPS_NORTH, 1300000, 1300000)).toBe("RA");
    expect(getMgrsSquareId(EARTH_CRS_UPS_NORTH, 1999999, 2000000)).toBe("ZH");
    expect(getMgrsSquareId(EARTH_CRS_UPS_NORTH, 2000000, 2699999)).toBe("AP");
    expect(getMgrsSquareId(EARTH_CRS_UPS_NORTH, 2699999, 2000000)).toBe("JH");
    expect(getMgrsSquareId(EARTH_CRS_UPS_NORTH, 2000000, 1299999)).toBeNull();
    expect(getMgrsSquareId(EARTH_CRS_UPS_NORTH, 2000000, 2700000)).toBeNull();
  });

  test("letters every square of both UPS caps", () => {
    const random = createSeededRandom(32761);
    for (let i = 0; i < 5000; i++) {
      const south = random() < 0.5;
      const lat = south ? -80 - random() * 10 : 84 + random() * 6;
      const lon = random() * 360 - 180;
      const crs = south ? EARTH_CRS_UPS_SOUTH : EARTH_CRS_UPS_NORTH;
      expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
      expect(getMgrsSquareId(crs, out[0], out[1])).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("formatMgrs (from E/N)", () => {
  test("is exact on box lines", () => {
    expect(formatMgrs(utm(15), 300000, 3200000, 29, 10)).toBe("15R UN 0000 0000");
    expect(formatMgrs(utm(15), 299999.999999, 3199999.999999, 29, 10)).toBe("15R TM 9999 9999");
    expect(formatMgrs(utm(15), 297520, 3271780, 29, 10)).toBe("15R TN 9752 7178");
    expect(formatMgrs(utm(15), 297519.999999, 3271779.999999, 29, 10)).toBe("15R TN 9751 7177");
    expect(formatMgrs(EARTH_CRS_UPS_NORTH, 2000000, 2000000, 90, 1)).toBe("Z AH 00000 00000");
    expect(formatMgrs(EARTH_CRS_UPS_NORTH, 1999999.999, 2000000, 89.9, 1)).toBe("Y ZH 99999 00000");
  });

  test("takes the band from the supplied latitude", () => {
    expect(formatMgrs(utm(28), 500000, 7100000, 63.999, 1000)).toBe("28V ES 00 00");
    expect(formatMgrs(utm(28), 500000, 7100000, 64, 1000)).toBe("28W ES 00 00");
  });

  test("rejects a latitude outside the crs", () => {
    expect(formatMgrs(utm(15), 300000, 3200000, -1, 10)).toBeNull();
    expect(formatMgrs(utm(15), 300000, 3200000, 84, 10)).toBeNull();
    expect(formatMgrs(utm(15, "S"), 300000, 3200000, 0, 10)).toBeNull();
    expect(formatMgrs(utm(15, "S"), 300000, 3200000, -80.1, 10)).toBeNull();
    expect(formatMgrs(EARTH_CRS_UPS_NORTH, 2000000, 2000000, 83.9, 10)).toBeNull();
    expect(formatMgrs(EARTH_CRS_UPS_SOUTH, 2000000, 2000000, -80, 10)).toBeNull();
    expect(formatMgrs(-1, 2000000, 2000000, 0, 10)).toBeNull();
  });
});

describe("band letters for points and boxes", () => {
  test("validates the point latitude against the crs", () => {
    expect(getEarthPointBandLetter(utm(15), 29.5)).toBe("R");
    expect(getEarthPointBandLetter(utm(15), 0)).toBe("N");
    expect(getEarthPointBandLetter(utm(15, "S"), -80)).toBe("C");
    expect(getEarthPointBandLetter(EARTH_CRS_UPS_NORTH, 84)).toBe("");
    expect(getEarthPointBandLetter(EARTH_CRS_UPS_SOUTH, -90)).toBe("");
    expect(getEarthPointBandLetter(utm(15), NaN)).toBeNull();
  });

  test("clamps the box band to the crs", () => {
    expect(getEarthBoxBandLetter(utm(15), 500000, 9350000)).toBe("X");
    expect(getEarthBoxBandLetter(utm(15, "S"), 500000, 1050000)).toBe("C");
    expect(getEarthBoxBandLetter(utm(15, "S"), 500000, 10050000)).toBe("M");
    expect(getEarthBoxBandLetter(utm(15), 500000, -50000)).toBe("N");
    expect(getEarthBoxBandLetter(EARTH_CRS_UPS_SOUTH, 2000000, 2000000)).toBe("");
    expect(getEarthBoxBandLetter(-1, 2000000, 2000000)).toBeNull();
  });
});

describe("formatMgrsBoxLabel", () => {
  test("labels a 10 m box from its corner", () => {
    expect(formatMgrsBoxLabel(utm(15), 297510, 3271770, 10)).toEqual({
      lgrs: "15RTN97517177",
      acc: "15RTN97517177",
      prefix: "15RTN",
      condensed: "97517177",
      text: "9751 7177",
      lowerLeft: [297510, 3271770],
      precision: 10,
    });
  });

  test("labels 100 km squares with the prefix", () => {
    expect(formatMgrsBoxLabel(utm(15), 200000, 3200000, 100000)).toEqual({
      lgrs: "15RTN",
      acc: "15RTN",
      prefix: "15RTN",
      condensed: "",
      text: "15RTN",
      lowerLeft: [200000, 3200000],
      precision: 100000,
    });
    expect(formatMgrsBoxLabel(utm(15), 297516, 3271776, 10000)?.text).toBe("9 7");
    expect(formatMgrsBoxLabel(EARTH_CRS_UPS_NORTH, 2000000, 2000000, 100000)?.text).toBe("ZAH");
    expect(formatMgrsBoxLabel(EARTH_CRS_UPS_NORTH, 1900000, 2000000, 100000)?.text).toBe("YZH");
  });

  test("owns [k·p, (k+1)·p)", () => {
    expect(formatMgrsBoxLabel(utm(15), 297519.999, 3271779.999, 10)?.lowerLeft).toEqual([
      297510, 3271770,
    ]);
    expect(formatMgrsBoxLabel(utm(15), 297520, 3271780, 10)?.lowerLeft).toEqual([297520, 3271780]);
  });

  test("labels a partial box at a zone edge in the zone being drawn", () => {
    const label = formatMgrsBoxLabel(utm(15), 100000, 3300000, 100000);
    expect(label?.prefix).toBe("15RSP");
    expect(unprojectEarthToLatLon(150000, 3350000, utm(15), out)).toBe(true);
    expect(classifyEarthLatLon(out[0], out[1])).not.toBe(utm(15));
  });

  test("takes the band from the box centre", () => {
    // Zone 28 central meridian, either side of 64° N.
    expect(projectEarthLatLon(64, -15, utm(28), out)).toBe(true);
    const n64 = out[1];
    const below = Math.floor(n64 / 1000) * 1000 - 1000;
    expect(formatMgrsBoxLabel(utm(28), 500000, below, 1000)?.prefix.slice(0, 3)).toBe("28V");
    expect(formatMgrsBoxLabel(utm(28), 500000, below + 2000, 1000)?.prefix.slice(0, 3)).toBe("28W");
    expect(formatMgrsBoxLabel(utm(15), 500000, 9300000, 100000)?.prefix).toBe("15XWP");
  });

  test("rejects invalid input", () => {
    expect(formatMgrsBoxLabel(-1, 500000, 0, 10)).toBeNull();
    expect(formatMgrsBoxLabel(utm(15), NaN, 0, 10)).toBeNull();
    expect(formatMgrsBoxLabel(utm(15), 50000, 0, 10)).toBeNull();
    expect(formatMgrsBoxLabel(utm(15), 500000, 0, 25000 as EarthMgrsPrecision)).toBeNull();
  });

  test("agrees with the point readout when the box and point share a band", () => {
    const random = createSeededRandom(1984);
    const precisions: EarthMgrsPrecision[] = [100000, 10000, 1000, 100, 10, 1];
    let compared = 0;
    for (let i = 0; i < 4000; i++) {
      const lat = random() * 170 - 85;
      const lon = random() * 360 - 180;
      const crs = classifyEarthLatLon(lat, lon);
      const precision = precisions[i % precisions.length];
      expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
      const label = formatMgrsBoxLabel(crs, out[0], out[1], precision);
      const point = formatMgrs(crs, out[0], out[1], lat, precision);
      const lowerLeft = label?.lowerLeft ?? [0, 0];
      const half = precision / 2;
      unprojectEarthToLatLon(lowerLeft[0] + half, lowerLeft[1] + half, crs, out);
      if (crs > 1 && getEarthLatitudeBandLetter(out[0]) !== getEarthLatitudeBandLetter(lat)) {
        continue;
      }
      expect(label?.lgrs).toBe(compact(point));
      compared++;
    }
    expect(compared).toBeGreaterThan(3500);
  });
});

describe("computeMgrsParts", () => {
  test("fills the zone/band, square and in-square metres", () => {
    const parts: MgrsParts = { zoneBand: "", square: "", easting: 0, northing: 0 };
    expect(computeMgrsParts(utm(15), 297516.44, 3271776.23, "R", parts)).toBe(true);
    expect(parts).toEqual({ zoneBand: "15R", square: "TN", easting: 97516, northing: 71776 });
    expect(computeMgrsParts(utm(15), 297516.44, 3271776.23, "", parts)).toBe(false);
    expect(computeMgrsParts(EARTH_CRS_UPS_SOUTH, 2000000, 2000000, "", parts)).toBe(true);
    expect(parts).toEqual({ zoneBand: "B", square: "AN", easting: 0, northing: 0 });
  });
});

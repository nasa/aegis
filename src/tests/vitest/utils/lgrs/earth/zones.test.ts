import {
  classifyEarthLatLon,
  conformEarthLongitude,
  EARTH_CRS_INVALID,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  formatEarthCrsName,
  getEarthCrsLatitudeLimits,
  getEarthLatitudeBandLetter,
  getEarthRegionSlices,
  getEarthZoneLongitudeLimits,
  getUpsBandLetter,
  getUpsCrsId,
  getUtmCentralMeridian,
  getUtmCrsId,
  getUtmZone,
  isInEarthRegion,
  isSouthEarthCrs,
  isUpsCrs,
  isUtmCrs,
  isValidEarthCrs,
} from "utils/lgrs/earth/zones";

import { createSeededRandom } from "../../../helpers/seededRandom";

const utm = (zone: number, hemisphere: LgrsHemisphere = "N") => getUtmCrsId(zone, hemisphere);
const below = (value: number) => value - Math.max(Math.abs(value) * Number.EPSILON, 1e-300);

describe("Earth CRS ids", () => {
  test("encodes UPS and UTM zone/hemisphere ids", () => {
    expect(getUpsCrsId("S")).toBe(0);
    expect(getUpsCrsId("N")).toBe(1);
    expect(utm(1)).toBe(2);
    expect(utm(1, "S")).toBe(3);
    expect(utm(15)).toBe(30);
    expect(utm(60, "S")).toBe(121);
    expect(utm(0)).toBe(EARTH_CRS_INVALID);
    expect(utm(61)).toBe(EARTH_CRS_INVALID);
    expect(utm(1.5)).toBe(EARTH_CRS_INVALID);
  });

  test("validates and decodes ids", () => {
    expect(isValidEarthCrs(0)).toBe(true);
    expect(isValidEarthCrs(121)).toBe(true);
    expect(isValidEarthCrs(122)).toBe(false);
    expect(isValidEarthCrs(-1)).toBe(false);
    expect(isValidEarthCrs(2.5)).toBe(false);
    expect(isUpsCrs(EARTH_CRS_UPS_NORTH)).toBe(true);
    expect(isUpsCrs(utm(1))).toBe(false);
    expect(isUtmCrs(utm(46))).toBe(true);
    expect(isUtmCrs(EARTH_CRS_UPS_SOUTH)).toBe(false);
    expect(isSouthEarthCrs(EARTH_CRS_UPS_SOUTH)).toBe(true);
    expect(isSouthEarthCrs(EARTH_CRS_UPS_NORTH)).toBe(false);
    expect(isSouthEarthCrs(utm(15, "S"))).toBe(true);
    expect(isSouthEarthCrs(utm(15))).toBe(false);
    for (let zone = 1; zone <= 60; zone++) {
      expect(getUtmZone(utm(zone))).toBe(zone);
      expect(getUtmZone(utm(zone, "S"))).toBe(zone);
    }
    expect(getUtmZone(EARTH_CRS_UPS_NORTH)).toBe(0);
    expect(getUtmZone(122)).toBe(0);
    expect(getUtmCentralMeridian(1)).toBe(-177);
    expect(getUtmCentralMeridian(15)).toBe(-93);
    expect(getUtmCentralMeridian(60)).toBe(177);
  });

  test("formats CRS names", () => {
    expect(formatEarthCrsName(utm(15))).toBe("15N");
    expect(formatEarthCrsName(utm(4, "S"))).toBe("4S");
    expect(formatEarthCrsName(utm(60, "S"))).toBe("60S");
    expect(formatEarthCrsName(EARTH_CRS_UPS_NORTH)).toBe("UPS N");
    expect(formatEarthCrsName(EARTH_CRS_UPS_SOUTH)).toBe("UPS S");
    expect(formatEarthCrsName(-1)).toBe("");
    expect(formatEarthCrsName(122)).toBe("");
  });
});

describe("conformEarthLongitude", () => {
  test.each([
    [0, 0],
    [-180, -180],
    [180, -180],
    [179.9999, 179.9999],
    [360, 0],
    [540, -180],
    [-190, 170],
    [190, -170],
    [-540, -180],
    [720.5, 0.5],
  ])("conforms %s to %s", (lon, expected) => {
    expect(conformEarthLongitude(lon)).toBe(expected);
  });
});

describe("classifyEarthLatLon", () => {
  test("classifies the worked examples", () => {
    expect(formatEarthCrsName(classifyEarthLatLon(29.5593, -95.09))).toBe("15N");
    expect(formatEarthCrsName(classifyEarthLatLon(29.25, -103.25))).toBe("13N");
    expect(formatEarthCrsName(classifyEarthLatLon(64.8, -17))).toBe("28N");
    expect(formatEarthCrsName(classifyEarthLatLon(0.0001, -179.9999))).toBe("1N");
    expect(formatEarthCrsName(classifyEarthLatLon(-33.8688, 151.2093))).toBe("56S");
  });

  test("rejects invalid input", () => {
    expect(classifyEarthLatLon(90.0001, 0)).toBe(EARTH_CRS_INVALID);
    expect(classifyEarthLatLon(-90.0001, 0)).toBe(EARTH_CRS_INVALID);
    expect(classifyEarthLatLon(NaN, 0)).toBe(EARTH_CRS_INVALID);
    expect(classifyEarthLatLon(0, NaN)).toBe(EARTH_CRS_INVALID);
    expect(classifyEarthLatLon(0, Infinity)).toBe(EARTH_CRS_INVALID);
  });

  test("puts the equator in the north and anything below it in the south", () => {
    expect(classifyEarthLatLon(0, -93)).toBe(utm(15));
    expect(classifyEarthLatLon(-0, -93)).toBe(utm(15));
    expect(classifyEarthLatLon(-Number.MIN_VALUE, -93)).toBe(utm(15, "S"));
    expect(classifyEarthLatLon(below(0), -93)).toBe(utm(15, "S"));
  });

  test("splits UTM and UPS at exactly 80° S and 84° N", () => {
    expect(classifyEarthLatLon(-80, 10)).toBe(utm(32, "S"));
    expect(classifyEarthLatLon(below(-80), 10)).toBe(EARTH_CRS_UPS_SOUTH);
    expect(classifyEarthLatLon(below(84), -60)).toBe(utm(21));
    expect(classifyEarthLatLon(84, -60)).toBe(EARTH_CRS_UPS_NORTH);
    expect(classifyEarthLatLon(90, 0)).toBe(EARTH_CRS_UPS_NORTH);
    expect(classifyEarthLatLon(-90, 0)).toBe(EARTH_CRS_UPS_SOUTH);
  });

  test("gives every zone meridian to the zone east of it", () => {
    for (let zone = 1; zone <= 60; zone++) {
      const west = (zone - 1) * 6 - 180;
      expect(classifyEarthLatLon(10, west)).toBe(utm(zone));
      expect(classifyEarthLatLon(-10, west)).toBe(utm(zone, "S"));
      const westNeighbour = zone === 1 ? 60 : zone - 1;
      expect(classifyEarthLatLon(10, below(west))).toBe(utm(westNeighbour));
      expect(classifyEarthLatLon(10, west + 5.999999999999)).toBe(utm(zone));
    }
  });

  test("wraps the antimeridian into zone 1", () => {
    expect(classifyEarthLatLon(0, 180)).toBe(utm(1));
    expect(classifyEarthLatLon(0, -180)).toBe(utm(1));
    expect(classifyEarthLatLon(0, below(180))).toBe(utm(60));
    expect(classifyEarthLatLon(0, 540)).toBe(utm(1));
    expect(classifyEarthLatLon(0, -186)).toBe(utm(60));
  });

  test("applies the Norway exception in band V only", () => {
    expect(classifyEarthLatLon(60, below(3))).toBe(utm(31));
    expect(classifyEarthLatLon(60, 3)).toBe(utm(32));
    expect(classifyEarthLatLon(60, 5.32)).toBe(utm(32));
    expect(classifyEarthLatLon(60, below(12))).toBe(utm(32));
    expect(classifyEarthLatLon(60, 12)).toBe(utm(33));
    expect(classifyEarthLatLon(56, 4)).toBe(utm(32));
    expect(classifyEarthLatLon(below(56), 4)).toBe(utm(31));
    expect(classifyEarthLatLon(below(64), 4)).toBe(utm(32));
    expect(classifyEarthLatLon(64, 4)).toBe(utm(31));
  });

  test("applies the Svalbard exception in band X only", () => {
    const lat = 78;
    expect(classifyEarthLatLon(lat, below(0))).toBe(utm(30));
    expect(classifyEarthLatLon(lat, 0)).toBe(utm(31));
    expect(classifyEarthLatLon(lat, below(9))).toBe(utm(31));
    expect(classifyEarthLatLon(lat, 9)).toBe(utm(33));
    expect(classifyEarthLatLon(lat, below(21))).toBe(utm(33));
    expect(classifyEarthLatLon(lat, 21)).toBe(utm(35));
    expect(classifyEarthLatLon(lat, below(33))).toBe(utm(35));
    expect(classifyEarthLatLon(lat, 33)).toBe(utm(37));
    expect(classifyEarthLatLon(lat, below(42))).toBe(utm(37));
    expect(classifyEarthLatLon(lat, 42)).toBe(utm(38));
    expect(classifyEarthLatLon(72, 7)).toBe(utm(31));
    expect(classifyEarthLatLon(below(72), 7)).toBe(utm(32));
    expect(classifyEarthLatLon(below(84), 7)).toBe(utm(31));
  });

  test("agrees with isInEarthRegion", () => {
    expect(isInEarthRegion(60, 5, utm(32))).toBe(true);
    expect(isInEarthRegion(60, 5, utm(31))).toBe(false);
    expect(isInEarthRegion(-85, 0, EARTH_CRS_UPS_SOUTH)).toBe(true);
    expect(isInEarthRegion(91, 0, EARTH_CRS_INVALID)).toBe(false);
  });
});

describe("getEarthLatitudeBandLetter", () => {
  test("owns [south, north) on every band parallel", () => {
    const letters = "CDEFGHJKLMNPQRSTUVWX";
    for (let index = 0; index < 20; index++) {
      const south = -80 + index * 8;
      expect(getEarthLatitudeBandLetter(south)).toBe(letters[index]);
      if (index > 0) expect(getEarthLatitudeBandLetter(below(south))).toBe(letters[index - 1]);
    }
  });

  test("makes X 12° tall and stops at the UTM limits", () => {
    expect(getEarthLatitudeBandLetter(72)).toBe("X");
    expect(getEarthLatitudeBandLetter(80)).toBe("X");
    expect(getEarthLatitudeBandLetter(below(84))).toBe("X");
    expect(getEarthLatitudeBandLetter(below(72))).toBe("W");
    expect(getEarthLatitudeBandLetter(84)).toBe("");
    expect(getEarthLatitudeBandLetter(-80)).toBe("C");
    expect(getEarthLatitudeBandLetter(below(-80))).toBe("");
    expect(getEarthLatitudeBandLetter(NaN)).toBe("");
  });

  test("splits M and N exactly at the equator", () => {
    expect(getEarthLatitudeBandLetter(0)).toBe("N");
    expect(getEarthLatitudeBandLetter(-0)).toBe("N");
    expect(getEarthLatitudeBandLetter(-Number.MIN_VALUE)).toBe("M");
    expect(getEarthLatitudeBandLetter(64.8)).toBe("W");
    expect(getEarthLatitudeBandLetter(29.5593)).toBe("R");
  });
});

describe("getUpsBandLetter", () => {
  test("splits at the false easting", () => {
    expect(getUpsBandLetter(EARTH_CRS_UPS_SOUTH, 1999999.999)).toBe("A");
    expect(getUpsBandLetter(EARTH_CRS_UPS_SOUTH, 2000000)).toBe("B");
    expect(getUpsBandLetter(EARTH_CRS_UPS_NORTH, 1999999.999)).toBe("Y");
    expect(getUpsBandLetter(EARTH_CRS_UPS_NORTH, 2000000)).toBe("Z");
    expect(getUpsBandLetter(utm(15), 2000000)).toBe("");
  });
});

describe("region geometry", () => {
  test("gives latitude limits per CRS", () => {
    expect(getEarthCrsLatitudeLimits(utm(15))).toEqual([0, 84]);
    expect(getEarthCrsLatitudeLimits(utm(15, "S"))).toEqual([-80, 0]);
    expect(getEarthCrsLatitudeLimits(EARTH_CRS_UPS_NORTH)).toEqual([84, 90]);
    expect(getEarthCrsLatitudeLimits(EARTH_CRS_UPS_SOUTH)).toEqual([-90, -80]);
  });

  test("gives zone longitude limits including the exception slices", () => {
    expect(getEarthZoneLongitudeLimits(utm(15), 30)).toEqual([-96, -90]);
    expect(getEarthZoneLongitudeLimits(utm(1, "S"), -30)).toEqual([-180, -174]);
    expect(getEarthZoneLongitudeLimits(utm(31), 60)).toEqual([0, 3]);
    expect(getEarthZoneLongitudeLimits(utm(32), 56)).toEqual([3, 12]);
    expect(getEarthZoneLongitudeLimits(utm(32), 64)).toEqual([6, 12]);
    expect(getEarthZoneLongitudeLimits(utm(31), 72)).toEqual([0, 9]);
    expect(getEarthZoneLongitudeLimits(utm(37), 80)).toEqual([33, 42]);
    expect(getEarthZoneLongitudeLimits(utm(32), 72)).toBeNull();
    expect(getEarthZoneLongitudeLimits(utm(34), 75)).toBeNull();
    expect(getEarthZoneLongitudeLimits(utm(15), 84)).toBeNull();
    expect(getEarthZoneLongitudeLimits(utm(15), -1)).toBeNull();
    expect(getEarthZoneLongitudeLimits(EARTH_CRS_UPS_NORTH, 90)).toEqual([-180, 180]);
    expect(getEarthZoneLongitudeLimits(EARTH_CRS_UPS_SOUTH, -80)).toBeNull();
  });

  test("slices partition the globe exactly as the classifier does", () => {
    const random = createSeededRandom(8401);
    const inSlices = (lat: number, lon: number, crs: LgrsCrsId) =>
      getEarthRegionSlices(crs).some(
        (s) =>
          lat >= s.south &&
          (lat < s.north || (s.north === 90 && lat === 90)) &&
          lon >= s.west &&
          lon < s.east
      );
    const check = (lat: number, lon: number) => {
      const crs = classifyEarthLatLon(lat, lon);
      expect(inSlices(lat, lon, crs)).toBe(true);
      // No other CRS claims the point.
      const owners = [];
      for (let id = 0; id <= 121; id++) if (inSlices(lat, lon, id)) owners.push(id);
      expect(owners).toEqual([crs]);
    };
    for (let i = 0; i < 2000; i++) check(random() * 180 - 90, random() * 360 - 180);
    // Every slice corner and the points just inside/outside it.
    for (let crs = 0; crs <= 121; crs++) {
      for (const s of getEarthRegionSlices(crs)) {
        for (const lat of [s.south, below(s.north), below(s.south), s.north]) {
          for (const lon of [s.west, below(s.west), below(s.east), s.east]) {
            if (lat >= -90 && lat <= 90) check(lat, conformEarthLongitude(lon));
          }
        }
      }
    }
    expect(getEarthRegionSlices(-1)).toEqual([]);
  });
});

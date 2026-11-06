import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatEarthAccBoxLabel, formatEarthAccFromLatLon } from "utils/lgrs/earth/acc";
import { formatCanonicalMgrs, formatMgrsBoxLabel } from "utils/lgrs/earth/mgrs";
import { projectEarthLatLon, unprojectEarthToLatLon } from "utils/lgrs/earth/projection";
import { getEarthGridSystem } from "utils/lgrs/earth/system";
import {
  classifyEarthLatLon,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getEarthRegionSlices,
  getUtmCentralMeridian,
  getUtmCrsId,
  getUtmZone,
  isInEarthRegion,
} from "utils/lgrs/earth/zones";
import { getFixedGridSpacings } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";
import { getGridSystem } from "utils/lgrs/system";

import { createSeededRandom } from "../../../helpers/seededRandom";

type EndToEndCase = {
  category: string;
  latitude: number;
  longitude: number;
  expected: {
    crsId: LgrsCrsId;
    acc: Record<string, { condensed: string; full: string }>;
    mgrs: Record<string, string>;
  };
};

const examples = (
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs-earth/v1/end-to-end.json"),
      "utf8"
    )
  ) as { cases: EndToEndCase[] }
).cases.filter((c) => c.category === "plan-example");

const acc = getEarthGridSystem("lunar-acc");
const mgrs = getEarthGridSystem("mgrs");
const utm = (zone: number, hemisphere: LgrsHemisphere = "N") => getUtmCrsId(zone, hemisphere);
const out = new Float64Array(2);
const latLon = new Float64Array(2);

describe("getEarthGridSystem", () => {
  test("has one cached instance per scheme", () => {
    expect(getEarthGridSystem("lunar-acc")).toBe(acc);
    expect(getEarthGridSystem("mgrs")).toBe(mgrs);
    expect(getGridSystem("earth-wgs84", "lunar-acc")).toBe(acc);
    expect(getGridSystem("earth-wgs84", "mgrs")).toBe(mgrs);
    expect(Object.isFrozen(acc) && Object.isFrozen(mgrs)).toBe(true);
  });

  test("identifies itself", () => {
    expect([acc.key, acc.id, acc.scheme]).toEqual([
      "earth-wgs84/lunar-acc",
      "earth-wgs84",
      "lunar-acc",
    ]);
    expect([mgrs.key, mgrs.id, mgrs.scheme]).toEqual(["earth-wgs84/mgrs", "earth-wgs84", "mgrs"]);
    expect(acc.drawsZoneTier || mgrs.drawsZoneTier).toBe(false);
  });

  test("has the plan §5 box spacings and map-menu choices", () => {
    expect(acc.getBoxSpacings()).toEqual([10, 100, 1000, 25000]);
    expect(mgrs.getBoxSpacings()).toEqual([10, 100, 1000, 10000, 100000]);
    expect(getFixedGridSpacings(acc)).toEqual([10, 100, 1000]);
    expect(getFixedGridSpacings(mgrs)).toEqual([10, 100, 1000, 10000]);
  });

  test("flags a planet radius that is not Earth-scale", () => {
    expect(acc.checkPlanetRadius(6378137)).toBeNull();
    for (const radius of [1737400, null, undefined, 0]) {
      expect(acc.checkPlanetRadius(radius)).toMatch(/Earth-scale/);
    }
  });

  test("validates the 122 Earth CRS ids and names them", () => {
    expect(acc.isValidCrs(0) && acc.isValidCrs(121)).toBe(true);
    expect(acc.isValidCrs(122) || acc.isValidCrs(-1) || acc.isValidCrs(1.5)).toBe(false);
    expect(acc.formatCrsName(utm(15))).toBe("15N");
    expect(acc.formatCrsName(EARTH_CRS_UPS_SOUTH)).toBe("UPS S");
    expect(acc.formatCrsName(-1)).toBe("");
  });

  test("classifies, projects and tests regions with the Earth core", () => {
    const random = createSeededRandom(5);
    for (let index = 0; index < 500; index++) {
      const lat = -90 + random() * 180;
      const lon = -180 + random() * 360;
      const crs = classifyEarthLatLon(lat, lon);
      expect(acc.classifyLatLon(lat, lon)).toBe(crs);
      expect(mgrs.isInRegion(lat, lon, crs)).toBe(true);
      expect(mgrs.isInRegion(lat, lon, crs === 0 ? 1 : 0)).toBe(false);
      expect(acc.projectLatLon(lat, lon, crs, out)).toBe(true);
      expect(projectEarthLatLon(lat, lon, crs, latLon)).toBe(true);
      expect([...out]).toEqual([...latLon]);
      expect(acc.unprojectToLatLon(out[0], out[1], crs, latLon)).toBe(true);
      expect(latLon[0]).toBeCloseTo(lat, 9);
    }
  });
});

describe("Earth formatPoint", () => {
  test.each(examples)("formats the §3.4 example at ($latitude, $longitude)", (example) => {
    const { latitude: lat, longitude: lon, expected } = example;
    expect(acc.formatPoint(lat, lon, 10, "condensed")).toBe(expected.acc["10"].condensed);
    expect(acc.formatPoint(lat, lon, 10, "full")).toBe(expected.acc["10"].full);
    expect(mgrs.formatPoint(lat, lon, 10, "full")).toBe(expected.mgrs["10"]);
    const [, ...rest] = expected.mgrs["10"].split(" ");
    expect(mgrs.formatPoint(lat, lon, 10, "condensed")).toBe(rest.join(" "));
  });

  test("gives JSC in both schemes and both styles", () => {
    expect(acc.formatPoint(29.5593, -95.09, 10, "condensed")).toBe("X51 W77");
    expect(acc.formatPoint(29.5593, -95.09, 10, "full")).toBe("15RTNDC X51 W77");
    expect(mgrs.formatPoint(29.5593, -95.09, 10, "full")).toBe("15R TN 9751 7177");
    expect(mgrs.formatPoint(29.5593, -95.09, 10, "condensed")).toBe("TN 9751 7177");
  });

  test("gives the prefix alone at the prefix-only precision", () => {
    expect(acc.formatPoint(29.5593, -95.09, 25000, "condensed")).toBe("15RTNDC");
    expect(acc.formatPoint(29.5593, -95.09, 25000, "full")).toBe("15RTNDC");
    expect(mgrs.formatPoint(29.5593, -95.09, 100000, "condensed")).toBe("15R TN");
    expect(mgrs.formatPoint(29.5593, -95.09, 100000, "full")).toBe("15R TN");
  });

  test("maps a precision outside the scheme to the coarsest one not coarser than it", () => {
    const [lat, lon] = [29.5593, -95.09];
    expect(acc.formatPoint(lat, lon, 10000, "full")).toBe(
      formatEarthAccFromLatLon(lat, lon, 1000, "full")
    );
    expect(acc.formatPoint(lat, lon, 100000, "full")).toBe("15RTNDC");
    expect(mgrs.formatPoint(lat, lon, 25000, "full")).toBe(formatCanonicalMgrs(lat, lon, 10000));
    expect(mgrs.formatPoint(lat, lon, 25000, "condensed")).toBe("TN 9 7");
  });

  test("formats UPS points without a zone", () => {
    expect(mgrs.formatPoint(90, 0, 10, "full")).toBe("Z AH 0000 0000");
    expect(mgrs.formatPoint(90, 0, 10, "condensed")).toBe("AH 0000 0000");
    expect(acc.formatPoint(90, 0, 10, "full")).toMatch(/^ZAHAA -00 -00$/);
  });

  test("returns null for invalid points", () => {
    for (const system of [acc, mgrs]) {
      expect(system.formatPoint(91, 0, 10, "full")).toBeNull();
      expect(system.formatPoint(NaN, 0, 10, "full")).toBeNull();
      expect(system.formatPoint(0, Infinity, 10, "condensed")).toBeNull();
    }
  });
});

describe("Earth formatBox", () => {
  test("is the core box label for a corner inside the region", () => {
    const crs = utm(15);
    expect(acc.formatBox(297510, 3271770, crs, 10)).toEqual(
      formatEarthAccBoxLabel(crs, 297510, 3271770, 10)
    );
    expect(acc.formatBox(297510, 3271770, crs, 10)!.text).toBe("X51 W77");
    expect(mgrs.formatBox(297510, 3271770, crs, 10)).toEqual(
      formatMgrsBoxLabel(crs, 297510, 3271770, 10)
    );
    expect(mgrs.formatBox(290000, 3270000, crs, 10000)!.text).toBe("9 7");
    expect(mgrs.formatBox(300000, 3200000, crs, 100000)!.text).toBe("15RUN");
    expect(acc.formatBox(275000, 3250000, crs, 25000)!.text).toBe("15RTNDC");
  });

  test("returns null when the corner is in another region", () => {
    // 15N at E = 170 km, lat 30 lies west of the zone (in 14N).
    expect(unprojectEarthToLatLon(170000, 3320000, utm(15), latLon)).toBe(true);
    expect(classifyEarthLatLon(latLon[0], latLon[1])).toBe(utm(14));
    expect(acc.formatBox(170000, 3320000, utm(15), 1000)).toBeNull();
    // The southern hemisphere's top row starts on the equator, which belongs to the north.
    expect(acc.formatBox(500000, 10000000, utm(15, "S"), 1000)).toBeNull();
    expect(acc.formatBox(500000, 0, utm(15), 1000)).not.toBeNull();
    expect(mgrs.formatBox(0, 0, 999, 10)).toBeNull();
  });

  test("returns null for a precision the scheme does not label", () => {
    expect(acc.formatBox(290000, 3270000, utm(15), 10000)).toBeNull();
    expect(mgrs.formatBox(275000, 3250000, utm(15), 25000)).toBeNull();
  });
});

describe("Earth caps", () => {
  test.each([
    [EARTH_CRS_UPS_SOUTH, -80],
    [EARTH_CRS_UPS_NORTH, 84],
  ])("cap %s is the disc to its limiting parallel %s°, at every longitude", (crs, limit) => {
    const cap = acc.getCap(crs)!;
    expect(cap).toMatchObject({ centreE: 2000000, centreN: 2000000 });
    for (let lon = -180; lon < 180; lon += 7.5) {
      expect(projectEarthLatLon(limit, lon, crs, out)).toBe(true);
      expect(Math.abs(Math.hypot(out[0] - 2000000, out[1] - 2000000) - cap.radius)).toBeLessThan(
        1e-6
      );
    }
  });

  test("has no cap for UTM regions", () => {
    expect(acc.getCap(utm(15))).toBeNull();
    expect(acc.getCentralMeridian(utm(15))).toBe(-93);
    expect(acc.getCentralMeridian(utm(1, "S"))).toBe(-177);
    expect(acc.getCentralMeridian(EARTH_CRS_UPS_NORTH)).toBeNaN();
  });
});

describe("Earth getRegionBounds", () => {
  test("contains every point of every UTM region", () => {
    const random = createSeededRandom(11);
    const bounds = new Float64Array(4);
    for (let crs = 2; crs < 122; crs++) {
      acc.getRegionBounds(crs, bounds);
      for (const { south, north, west, east } of getEarthRegionSlices(crs)) {
        const points: [number, number][] = [
          [south, west],
          [south, east],
          [north, west],
          [north, east],
          [south, getUtmCentralMeridian(getUtmZone(crs))],
          [north, getUtmCentralMeridian(getUtmZone(crs))],
        ];
        for (let index = 0; index < 40; index++) {
          points.push([south + random() * (north - south), west + random() * (east - west)]);
        }
        for (const [lat, lon] of points) {
          expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
          expect(out[0]).toBeGreaterThanOrEqual(bounds[0]);
          expect(out[1]).toBeGreaterThanOrEqual(bounds[1]);
          expect(out[0]).toBeLessThanOrEqual(bounds[2]);
          expect(out[1]).toBeLessThanOrEqual(bounds[3]);
        }
      }
    }
  });

  test("is tight to within a few metres and widens for 32V and the X zones", () => {
    const bounds = new Float64Array(4);
    acc.getRegionBounds(utm(15), bounds);
    projectEarthLatLon(0, -96, utm(15), out);
    expect(Math.abs(bounds[0] - out[0])).toBeLessThan(2);
    expect(bounds[1]).toBe(0);
    acc.getRegionBounds(utm(15, "S"), bounds);
    expect(bounds[3]).toBe(10000000);
    const standard = new Float64Array(4);
    acc.getRegionBounds(utm(34), standard);
    acc.getRegionBounds(utm(32), bounds);
    expect(bounds[0]).toBeLessThan(standard[0] - 30000);
    acc.getRegionBounds(utm(33), bounds);
    expect(bounds[3]).toBeGreaterThan(standard[3]);
  });
});

/** Inside/outside of the line point `t` (the other coordinate) in `crs`. */
function lineInside(crs: LgrsCrsId, axis: "easting" | "northing", value: number, t: number) {
  const e = axis === "easting" ? value : t;
  const n = axis === "easting" ? t : value;
  return unprojectEarthToLatLon(e, n, crs, latLon) && isInEarthRegion(latLon[0], latLon[1], crs);
}

describe("Earth clipGridLine", () => {
  const regions = [
    utm(15),
    utm(15, "S"),
    utm(1),
    utm(60, "S"),
    utm(31),
    utm(32),
    utm(33),
    utm(35),
    utm(37),
    utm(38),
  ];
  const parts = new Float64Array(6);
  const bounds = new Float64Array(4);

  test.each(regions)("matches dense isInRegion sampling in crs %s", (crs) => {
    acc.getRegionBounds(crs, bounds);
    const random = createSeededRandom(crs);
    for (let line = 0; line < 30; line++) {
      const axis = line % 2 === 0 ? "easting" : "northing";
      const [lo, hi] = axis === "easting" ? [bounds[0], bounds[2]] : [bounds[1], bounds[3]];
      const [from, to] = axis === "easting" ? [bounds[1], bounds[3]] : [bounds[0], bounds[2]];
      const value = Math.round(lo + random() * (hi - lo));
      const count = acc.clipGridLine(crs, axis, value, parts);
      expect(count).toBeLessThanOrEqual(3);
      for (let part = 0; part < count; part++) {
        const start = parts[part * 2];
        const end = parts[part * 2 + 1];
        expect(start).toBeLessThan(end);
        if (part > 0) expect(start).toBeGreaterThan(parts[part * 2 - 1]);
        // Ends lie on the region boundary to a few centimetres.
        expect(lineInside(crs, axis, value, start + 0.02), `${axis} ${value}`).toBe(true);
        expect(lineInside(crs, axis, value, end - 0.02), `${axis} ${value}`).toBe(true);
        if (start - 0.05 >= from) expect(lineInside(crs, axis, value, start - 0.05)).toBe(false);
        if (end + 0.05 <= to) expect(lineInside(crs, axis, value, end + 0.05)).toBe(false);
      }
      const samples = 2000;
      for (let index = 0; index <= samples; index++) {
        const t = from + ((to - from) * index) / samples;
        let inPart = false;
        let nearEnd = false;
        for (let part = 0; part < count; part++) {
          const start = parts[part * 2];
          const end = parts[part * 2 + 1];
          if (t >= start && t <= end) inPart = true;
          if (Math.abs(t - start) < 0.01 || Math.abs(t - end) < 0.01) nearEnd = true;
        }
        if (nearEnd) continue;
        expect(lineInside(crs, axis, value, t), `${crs} ${axis} ${value} at ${t}`).toBe(inPart);
      }
    }
  });

  test("gives three parts for an easting through the 31V notch and the wider 31X", () => {
    const count = acc.clipGridLine(utm(31), "easting", 620000, parts);
    expect(count).toBe(3);
    const latitudes = [...parts.slice(0, 6)].map((n) => {
      unprojectEarthToLatLon(620000, n, utm(31), latLon);
      return latLon[0];
    });
    expect(latitudes[0]).toBeCloseTo(0, 9);
    expect(latitudes[1]).toBeCloseTo(56, 6);
    expect(latitudes[2]).toBeCloseTo(64, 6);
    expect(latitudes[4]).toBeCloseTo(72, 6);
  });

  test("leaves the 31V/32V boundary (zone 31's central meridian) to 32V", () => {
    const count = acc.clipGridLine(utm(31), "easting", 500000, parts);
    expect(count).toBe(2);
    unprojectEarthToLatLon(500000, parts[1], utm(31), latLon);
    expect(latLon[0]).toBeCloseTo(56, 6);
    unprojectEarthToLatLon(500000, parts[2], utm(31), latLon);
    expect(latLon[0]).toBeCloseTo(64, 6);
  });

  test("returns nothing outside the region or for caps", () => {
    expect(acc.clipGridLine(utm(15), "easting", 100000, parts)).toBe(0);
    expect(acc.clipGridLine(utm(15), "northing", -10, parts)).toBe(0);
    expect(acc.clipGridLine(EARTH_CRS_UPS_NORTH, "easting", 2000000, parts)).toBe(0);
    expect(acc.clipGridLine(utm(15), "easting", NaN, parts)).toBe(0);
  });

  test("skips only the equator as a seam grid line", () => {
    expect(acc.isSeamGridLine(utm(15), "northing", 0)).toBe(true);
    expect(acc.isSeamGridLine(utm(15, "S"), "northing", 10000000)).toBe(true);
    expect(acc.isSeamGridLine(utm(15), "easting", 500000)).toBe(false);
    expect(acc.isSeamGridLine(utm(15, "S"), "northing", 0)).toBe(false);
    expect(acc.isSeamGridLine(EARTH_CRS_UPS_NORTH, "northing", 2000000)).toBe(false);
  });
});

const envelope = (minLat: number, maxLat: number, minLon: number, maxLon: number) => ({
  minLat,
  maxLat,
  minLon,
  maxLon,
  fullLon: false,
});
const noSamples: LgrsViewSamples = {
  count: 0,
  lat: new Float64Array(0),
  lon: new Float64Array(0),
  crs: new Int32Array(0),
};

describe("Earth getCandidateRegions", () => {
  test("finds the zones and hemispheres overlapping the envelope", () => {
    expect(acc.getCandidateRegions(envelope(29, 30, -96.5, -94), noSamples)).toEqual([
      utm(14),
      utm(15),
    ]);
    expect(acc.getCandidateRegions(envelope(-0.5, 0.5, -94, -93), noSamples)).toEqual([
      utm(15),
      utm(15, "S"),
    ]);
  });

  test("finds exception slices that no sample falls in", () => {
    // 4.5° E at 55.9°: zone 31 below 56°, 32V just above it.
    expect(acc.getCandidateRegions(envelope(55.8, 56.05, 4.4, 4.6), noSamples)).toEqual([
      utm(31),
      utm(32),
    ]);
    expect(acc.getCandidateRegions(envelope(78, 79, 8.5, 9.5), noSamples)).toEqual([
      utm(31),
      utm(33),
    ]);
    // There is no 32X.
    expect(acc.getCandidateRegions(envelope(73, 74, 6.5, 8), noSamples)).toEqual([utm(31)]);
  });

  test("adds the caps and wraps the antimeridian", () => {
    expect(acc.getCandidateRegions(envelope(83.5, 84.5, -1, 1), noSamples)).toEqual([
      EARTH_CRS_UPS_NORTH,
      utm(30),
      utm(31),
    ]);
    expect(acc.getCandidateRegions(envelope(-80.5, -79.5, 10, 11), noSamples)).toEqual([
      EARTH_CRS_UPS_SOUTH,
      utm(32, "S"),
    ]);
    expect(acc.getCandidateRegions(envelope(10, 11, 179, 181), noSamples)).toEqual([
      utm(1),
      utm(60),
    ]);
  });
});

describe("Earth getFrameworkLines", () => {
  const meridians = (lines: LgrsFrameworkLine[]) =>
    lines
      .filter((line) => line.axis === "meridian")
      .map(({ value, from, to }) => [value, from, to]);

  test("draws the Norway and Svalbard exception edges as partial meridians", () => {
    const lines = acc.getFrameworkLines(envelope(-90, 90, 0, 43), false);
    expect(lines.every((line) => line.kind === "seam")).toBe(true);
    expect(meridians(lines)).toEqual([
      [0, -80, 84],
      [3, 56, 64],
      [6, -80, 56],
      [6, 64, 72],
      [9, 72, 84],
      [12, -80, 72],
      [18, -80, 72],
      [21, 72, 84],
      [24, -80, 72],
      [30, -80, 72],
      [33, 72, 84],
      [36, -80, 72],
      [42, -80, 84],
    ]);
  });

  test("draws the band parallels, the equator and the UTM/UPS seams inside the envelope", () => {
    const parallels = acc
      .getFrameworkLines(envelope(-85, 86, -1, 1), false)
      .filter((line) => line.axis === "parallel")
      .map((line) => line.value);
    expect(parallels).toEqual([
      -80, -72, -64, -56, -48, -40, -32, -24, -16, -8, 0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 84,
    ]);
    const iceland = acc.getFrameworkLines(envelope(63.5, 64.5, -18, -16), false);
    expect(iceland.filter((line) => line.axis === "parallel").map((line) => line.value)).toEqual([
      64,
    ]);
    expect(meridians(iceland)).toEqual([[-18, 63.5, 64.5]]);
  });

  test("clips meridians to the envelope latitudes and unwraps across 180°", () => {
    expect(meridians(acc.getFrameworkLines(envelope(10, 11, 179, 181), false))).toEqual([
      [180, 10, 11],
    ]);
  });

  test("has no zone tier", () => {
    expect(acc.getZoneLabels(envelope(-90, 90, -180, 180))).toEqual([]);
  });
});

describe("Earth getAffine", () => {
  const binding = (proj4Def: string) =>
    getLgrsGridBinding({ projCode: `TEST:${proj4Def}`, proj4Def }, acc);
  const UTM15 = "+proj=utm +zone=15 +datum=WGS84 +units=m +no_defs";

  /** Max |affine − grid projection| over random points of `crs` reachable from `[lat, lon]`. */
  function maxAffineError(target: LgrsGridBinding, crs: LgrsCrsId, lat: number, lon: number) {
    const random = createSeededRandom(3);
    const affine = target.getAffine(crs)!;
    let error = 0;
    for (let index = 0; index < 400; index++) {
      const pLat = lat + (random() - 0.5) * 8;
      const pLon = lon + (random() - 0.5) * 8;
      expect(target.latLonToMap(pLat, pLon, out)).toBe(true);
      const e = out[0] * affine.scale + affine.offsetE;
      const n = out[1] * affine.scale + affine.offsetN;
      expect(target.mapToLatLon(out[0], out[1], latLon)).toBe(true);
      expect(projectEarthLatLon(latLon[0], latLon[1], crs, out)).toBe(true);
      error = Math.max(error, Math.abs(e - out[0]), Math.abs(n - out[1]));
    }
    return error;
  }

  test("relates a UTM map to both hemispheres of its zone exactly", () => {
    const map = binding(UTM15);
    expect(map.getAffine(utm(15))).toEqual({ crs: utm(15), scale: 1, offsetE: 0, offsetN: 0 });
    expect(map.getAffine(utm(15, "S"))).toEqual({
      crs: utm(15, "S"),
      scale: 1,
      offsetE: 0,
      offsetN: 10000000,
    });
    expect(map.getAffine(utm(14))).toBeNull();
    expect(map.getAffine(EARTH_CRS_UPS_NORTH)).toBeNull();
    expect(maxAffineError(map, utm(15), 30, -93)).toBeLessThan(1e-6);
    expect(maxAffineError(map, utm(15, "S"), -30, -93)).toBeLessThan(1e-6);
  });

  test("scales a rescaled, shifted ellipsoidal TM on a zone meridian", () => {
    const map = binding(
      "+proj=tmerc +lat_0=0 +lon_0=-93 +k=0.9999 +x_0=0 +y_0=-3000000 +ellps=WGS84 +units=m +no_defs"
    );
    const affine = map.getAffine(utm(15))!;
    expect(affine.scale).toBeCloseTo(0.9996 / 0.9999, 15);
    expect(maxAffineError(map, utm(15), 30, -93)).toBeLessThan(1e-6);
  });

  test("relates a UPS map to its cap exactly", () => {
    const ups = binding(
      "+proj=stere +lat_0=90 +lat_ts=90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs"
    );
    expect(ups.getAffine(EARTH_CRS_UPS_NORTH)).toEqual({
      crs: EARTH_CRS_UPS_NORTH,
      scale: 1,
      offsetE: 0,
      offsetN: 0,
    });
    expect(ups.getAffine(EARTH_CRS_UPS_SOUTH)).toBeNull();
    expect(maxAffineError(ups, EARTH_CRS_UPS_NORTH, 86, 0)).toBeLessThan(1e-6);
    const variantB = binding(
      "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
    );
    expect(variantB.getAffine(EARTH_CRS_UPS_SOUTH)!.scale).not.toBe(1);
    expect(maxAffineError(variantB, EARTH_CRS_UPS_SOUTH, -86, 0)).toBeLessThan(1e-6);
  });

  test.each([
    ["Web Mercator", null],
    ["an off-meridian TM", "+proj=tmerc +lat_0=0 +lon_0=-94 +k=0.9996 +x_0=500000 +datum=WGS84"],
    ["a +approx TM", "+proj=tmerc +approx +lat_0=0 +lon_0=-93 +k=0.9996 +x_0=500000 +datum=WGS84"],
    ["a TM with lat_0", "+proj=tmerc +lat_0=10 +lon_0=-93 +k=0.9996 +x_0=500000 +datum=WGS84"],
    ["a shifted datum", "+proj=utm +zone=15 +ellps=WGS84 +towgs84=10,0,0 +units=m"],
    ["another ellipsoid", "+proj=utm +zone=15 +ellps=GRS67 +units=m"],
    ["a sphere", "+proj=tmerc +lat_0=0 +lon_0=-93 +k=0.9996 +x_0=500000 +R=6378137"],
    ["feet", "+proj=utm +zone=15 +datum=WGS84 +units=us-ft"],
    ["a rotated polar stereographic", "+proj=stere +lat_0=90 +lon_0=-45 +k=0.994 +datum=WGS84"],
  ])("finds no affine relation for %s", (_name, proj4Def) => {
    const map = proj4Def
      ? binding(proj4Def)
      : getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, acc);
    for (let crs = 0; crs < 122; crs++) expect(map.getAffine(crs)).toBeNull();
  });
});

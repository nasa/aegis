import proj4 from "proj4";

import { LGRS_CRS_LPS_NORTH, LGRS_CRS_LPS_SOUTH, getLtmCrsId } from "utils/lgrs/crs";
import { formatLatLonAsLgrs } from "utils/lgrs/format";
import {
  formatLgrsAtMapCoordinate,
  getLgrsMapAdapter,
  getLgrsMapProjection,
} from "utils/lgrs/mapAdapter";
import { projectLatLon, unprojectToLatLon } from "utils/lgrs/projection";

import { createSeededRandom } from "../../helpers/seededRandom";

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SOUTH_CAP = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;
const NORTH_CAP = `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;
const ZONE_23_TM = `+proj=tmerc +approx +lat_0=0 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;
const MOON_EQC = `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`;

const out = new Float64Array(2);
const other = new Float64Array(2);

function randomLatLons(seed: number, count: number, minLat: number, maxLat: number) {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => [
    minLat + random() * (maxLat - minLat),
    -180 + random() * 360,
  ]);
}

/** Asserts the adapter matches proj4 bit-for-bit in both directions. */
function expectProj4Identical(projCode: string, def: string | null, points: number[][]) {
  const adapter = getLgrsMapAdapter({ projCode, proj4Def: def });
  const converter = proj4(def ?? projCode, "EPSG:4326");
  let compared = 0;
  for (const [lat, lon] of points) {
    const map = converter.inverse([lon, lat]);
    if (!Number.isFinite(map[0]) || !Number.isFinite(map[1])) continue;
    expect(adapter.latLonToMap(lat, lon, out)).toBe(true);
    expect(Object.is(out[0], map[0]) && Object.is(out[1], map[1]), `${lat},${lon}`).toBe(true);
    const [expectedLon, expectedLat] = converter.forward(map);
    expect(adapter.mapToLatLon(map[0], map[1], out)).toBe(true);
    expect(Object.is(out[0], expectedLat) && Object.is(out[1], expectedLon), `${lat},${lon}`).toBe(
      true
    );
    compared++;
  }
  expect(compared).toBeGreaterThan(points.length * 0.9);
}

describe("getLgrsMapProjection", () => {
  test("mirrors the MapProvider projection code", () => {
    const base = { id: 7, projIsCustom: true, projEpsg: "IAU:30135", projProj4String: SOUTH_CAP };
    expect(getLgrsMapProjection(base)).toEqual({ projCode: "IAU:30135", proj4Def: SOUTH_CAP });
    expect(getLgrsMapProjection({ ...base, projEpsg: "EPSG:3857" })).toEqual({
      projCode: "AEGIS:7",
      proj4Def: SOUTH_CAP,
    });
    expect(getLgrsMapProjection({ ...base, projIsCustom: false })).toEqual({
      projCode: "EPSG:3857",
      proj4Def: null,
    });
    expect(getLgrsMapProjection({ ...base, projProj4String: "" }).projCode).toBe("EPSG:3857");
  });
});

describe("getLgrsMapAdapter fast paths", () => {
  test("reports cylindrical world widths in map units regardless of false origin", () => {
    expect(getLgrsMapAdapter({ projCode: "EPSG:3857", proj4Def: null }).worldWidth).toBeCloseTo(
      2 * Math.PI * 6378137,
      6
    );
    const shiftedEqc = `+proj=eqc +lat_ts=30 +lat_0=0 +lon_0=180 +x_0=12345 +y_0=6789 +a=1737400 +b=1737400 +units=km +no_defs`;
    expect(
      getLgrsMapAdapter({ projCode: "EQC:SHIFTED", proj4Def: shiftedEqc }).worldWidth
    ).toBeCloseTo((2 * Math.PI * 1737400 * Math.cos(Math.PI / 6)) / 1000, 6);
    expect(getLgrsMapAdapter({ projCode: "S", proj4Def: SOUTH_CAP }).worldWidth).toBeNull();
  });

  test("selects the closed form for supported spherical projections", () => {
    expect(getLgrsMapAdapter({ projCode: "S", proj4Def: SOUTH_CAP }).fastPath).toBe("stere-polar");
    expect(getLgrsMapAdapter({ projCode: "N", proj4Def: NORTH_CAP }).fastPath).toBe("stere-polar");
    expect(getLgrsMapAdapter({ projCode: "EPSG:3857", proj4Def: null }).fastPath).toBe("merc");
    expect(getLgrsMapAdapter({ projCode: "TM", proj4Def: ZONE_23_TM }).fastPath).toBe("tmerc");
    expect(getLgrsMapAdapter({ projCode: "EQC", proj4Def: MOON_EQC }).fastPath).toBeNull();
  });

  test("returns the cached adapter for the same projection", () => {
    const projection = { projCode: "S", proj4Def: SOUTH_CAP };
    expect(getLgrsMapAdapter(projection)).toBe(getLgrsMapAdapter({ ...projection }));
  });

  test("matches proj4 bit-for-bit on the south cap", () => {
    expectProj4Identical("S", SOUTH_CAP, [
      ...randomLatLons(1, 2000, -90, -75),
      ...randomLatLons(2, 500, -90, 80),
      [-90, 0],
      [-89.9999999, 12],
    ]);
  });

  test("matches proj4 bit-for-bit on the north cap", () => {
    expectProj4Identical("N", NORTH_CAP, randomLatLons(3, 2000, 75, 90));
  });

  test("matches proj4 bit-for-bit on Web Mercator", () => {
    expectProj4Identical("EPSG:3857", null, randomLatLons(4, 2000, -85, 85));
  });

  test("matches proj4 bit-for-bit on a spherical TM", () => {
    const random = createSeededRandom(5);
    const points = Array.from({ length: 2000 }, () => [-80 + random() * 160, -30 + random() * 60]);
    expectProj4Identical("TM", ZONE_23_TM, points);
  });

  test("uses proj4 for other projections", () => {
    const adapter = getLgrsMapAdapter({ projCode: "EQC", proj4Def: MOON_EQC });
    expectProj4Identical("EQC", MOON_EQC, randomLatLons(6, 200, -89, 89));
    expect(adapter.getAffine(getLtmCrsId(23, "N"))).toBeNull();
    expect(adapter.mapToLgrs(1000, 2000, getLtmCrsId(23, "N"), out)).toBe(true);
    adapter.mapToLatLon(1000, 2000, other);
    projectLatLon(other[0], other[1], getLtmCrsId(23, "N"), other);
    expect([out[0], out[1]]).toEqual([other[0], other[1]]);
  });

  test("fails cleanly when proj4 cannot build the projection", () => {
    const adapter = getLgrsMapAdapter({
      projCode: "BAD",
      proj4Def: `+proj=tmerc +lat_0=0 +lon_0=0 ${MOON}`,
    });
    expect(adapter.fastPath).toBeNull();
    expect(adapter.mapToLatLon(0, 0, out)).toBe(false);
    expect(adapter.latLonToMap(0, 0, out)).toBe(false);
    expect(formatLgrsAtMapCoordinate(adapter, 0, 0, 10, "acc")).toBeNull();
  });

  test("rejects non-finite input", () => {
    const adapter = getLgrsMapAdapter({ projCode: "EQC", proj4Def: MOON_EQC });
    expect(adapter.mapToLatLon(Number.NaN, 0, out)).toBe(false);
    expect(adapter.latLonToMap(0, Number.POSITIVE_INFINITY, out)).toBe(false);
  });
});

/** Frozen copies of the pre-0.4.0 south-cap affine helpers. */
function mapCapToLps([x, y]: [number, number]): [number, number] {
  return [x * 0.994 + 500000, y * 0.994 + 500000];
}

function lpsToMapCap([easting, northing]: [number, number]): [number, number] {
  return [(easting - 500000) / 0.994, (northing - 500000) / 0.994];
}

describe("LGRS affine relations", () => {
  test("generalises mapCapToLps / lpsToMapCap for the canonical south cap", () => {
    const adapter = getLgrsMapAdapter({ projCode: "S", proj4Def: SOUTH_CAP });
    expect(adapter.getAffine(LGRS_CRS_LPS_SOUTH)).toEqual({
      crs: LGRS_CRS_LPS_SOUTH,
      scale: 0.994,
      offsetE: 500000,
      offsetN: 500000,
    });
    expect(adapter.getAffine(LGRS_CRS_LPS_NORTH)).toBeNull();
    const random = createSeededRandom(7);
    for (let index = 0; index < 1000; index++) {
      const x = (random() - 0.5) * 700000;
      const y = (random() - 0.5) * 700000;
      adapter.mapToLgrs(x, y, LGRS_CRS_LPS_SOUTH, out);
      expect([out[0], out[1]]).toEqual(mapCapToLps([x, y]));
      adapter.lgrsToMap(out[0], out[1], LGRS_CRS_LPS_SOUTH, other);
      expect([other[0], other[1]]).toEqual(lpsToMapCap([out[0], out[1]]));
    }
  });

  test("maps the north cap to LPS North", () => {
    const adapter = getLgrsMapAdapter({ projCode: "N", proj4Def: NORTH_CAP });
    expect(adapter.getAffine(LGRS_CRS_LPS_NORTH)?.scale).toBe(0.994);
    expect(adapter.getAffine(LGRS_CRS_LPS_SOUTH)).toBeNull();
  });

  test("handles scaled and offset polar maps", () => {
    const def = `+proj=stere +lat_0=-90 +lon_0=0 +k=0.994 +x_0=500000 +y_0=500000 ${MOON}`;
    const affine = getLgrsMapAdapter({ projCode: "LPS", proj4Def: def }).getAffine(0);
    expect(affine).toEqual({ crs: 0, scale: 1, offsetE: 0, offsetN: 0 });
  });

  test("is affine to the matching LTM zone only", () => {
    const adapter = getLgrsMapAdapter({ projCode: "TM", proj4Def: ZONE_23_TM });
    expect(adapter.getAffine(getLtmCrsId(23, "N"))).toMatchObject({ scale: 0.999, offsetN: 0 });
    expect(adapter.getAffine(getLtmCrsId(23, "S"))).toMatchObject({ offsetN: 2500000 });
    expect(adapter.getAffine(getLtmCrsId(24, "N"))).toBeNull();
    expect(getLgrsMapAdapter({ projCode: "EPSG:3857", proj4Def: null }).getAffine(2)).toBeNull();
  });

  test("agrees with projecting the map lat/lon into the LGRS crs", () => {
    const cases = [
      { def: SOUTH_CAP, crs: LGRS_CRS_LPS_SOUTH, minLat: -90, maxLat: -80, lon: [-180, 180] },
      { def: NORTH_CAP, crs: LGRS_CRS_LPS_NORTH, minLat: 80, maxLat: 90, lon: [-180, 180] },
      { def: ZONE_23_TM, crs: getLtmCrsId(23, "N"), minLat: 0, maxLat: 80, lon: [-4, 4] },
      { def: ZONE_23_TM, crs: getLtmCrsId(23, "S"), minLat: -80, maxLat: 0, lon: [-4, 4] },
    ];
    const random = createSeededRandom(8);
    for (const { def, crs, minLat, maxLat, lon: lonRange } of cases) {
      const adapter = getLgrsMapAdapter({ projCode: def, proj4Def: def });
      let worst = 0;
      for (let index = 0; index < 2000; index++) {
        const lat = minLat + random() * (maxLat - minLat);
        const lon = lonRange[0] + random() * (lonRange[1] - lonRange[0]);
        adapter.latLonToMap(lat, lon, out);
        adapter.mapToLgrs(out[0], out[1], crs, other);
        projectLatLon(lat, lon, crs, out);
        worst = Math.max(worst, Math.abs(out[0] - other[0]), Math.abs(out[1] - other[1]));
      }
      expect(worst, def).toBeLessThan(1e-6);
    }
  });

  // proj4's asin-based stereographic inverse loses latitude precision as 1/(distance to pole).
  test("keeps proj4's lat/lon within 0.02 mm of the exact inverse from 1 m off the pole", () => {
    const adapter = getLgrsMapAdapter({ projCode: "S", proj4Def: SOUTH_CAP });
    let worstMeters = 0;
    for (const radius of [1, 10, 100, 1000, 1e4, 1e5, 3e5]) {
      for (let index = 0; index < 64; index++) {
        const angle = (index / 64) * 2 * Math.PI;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        adapter.mapToLatLon(x, y, out);
        adapter.mapToLgrs(x, y, LGRS_CRS_LPS_SOUTH, other);
        unprojectToLatLon(other[0], other[1], LGRS_CRS_LPS_SOUTH, other);
        const latErrorMeters = (Math.abs(out[0] - other[0]) * Math.PI * 1737400) / 180;
        worstMeters = Math.max(worstMeters, latErrorMeters);
      }
    }
    expect(worstMeters).toBeLessThan(2e-5);
  });
});

describe("formatLgrsAtMapCoordinate", () => {
  test("formats a map coordinate through its lat/lon", () => {
    const adapter = getLgrsMapAdapter({ projCode: "EPSG:3857", proj4Def: null });
    adapter.latLonToMap(-3.645421873728663, -17.47186660766602, out);
    expect(formatLgrsAtMapCoordinate(adapter, out[0], out[1], 10, "acc")).toBe(
      formatLatLonAsLgrs(-3.645421873728663, -17.47186660766602, 10, "acc")
    );
    expect(formatLgrsAtMapCoordinate(adapter, out[0], out[1], 10, "acc")).toMatch(/^21M/);
  });
});

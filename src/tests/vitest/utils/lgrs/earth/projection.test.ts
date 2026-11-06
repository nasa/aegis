import proj4 from "proj4";

import {
  getEarthProj4Definition,
  projectEarthLatLon,
  unprojectEarthToLatLon,
} from "utils/lgrs/earth/projection";
import {
  classifyEarthLatLon,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getUtmCrsId,
} from "utils/lgrs/earth/zones";

import { createSeededRandom } from "../../../helpers/seededRandom";

const out = new Float64Array(2);
const back = new Float64Array(2);
const utm = (zone: number, hemisphere: LgrsHemisphere = "N") => getUtmCrsId(zone, hemisphere);

/** pyproj 3.8.0 (PROJ 9.8.1), EPSG:4326 → EPSG:326xx/327xx/32661/32761. */
const PYPROJ_CASES: [lat: number, lon: number, crs: LgrsCrsId, e: number, n: number][] = [
  [29.5593, -95.09, utm(15), 297516.4385133701, 3271776.2297767177],
  [29.25, -103.25, utm(13), 670052.0374414623, 3236953.1773375715],
  [64.8, -17.0, utm(28), 404994.40451719577, 7187665.836658812],
  [0.0001, -179.9999, utm(1), 166032.5859507384, 11.068274579507069],
  [-33.8688, 151.2093, utm(56, "S"), 334368.633648097, 6250948.345385009],
  [-45.0, 177.5, utm(60, "S"), 539407.6490169232, 5016928.01240759],
  [60.39, 5.32, utm(32), 297230.2202096259, 6700510.175253601],
  [58.0, 2.0, utm(31), 440892.105175155, 6429147.611133263],
  [78.22, 15.65, utm(33), 514813.5272637488, 8683004.153277192],
  [79.0, 8.0, utm(31), 606380.0691708527, 8774533.543309141],
  [80.0, 25.0, utm(35), 461235.9422851667, 8882252.169698298],
  [80.0, 40.0, utm(37), 519384.80329597276, 8881752.41480744],
  [83.9, -60.0, utm(20), 535575.680189575, 9317856.466148265],
  [-79.9, 30.0, utm(36, "S"), 441292.55274039565, 1128062.1713838298],
  [85.0, -45.0, EARTH_CRS_UPS_NORTH, 1607232.3118931183, 1607232.3118931183],
  [85.0, 45.0, EARTH_CRS_UPS_NORTH, 2392767.6881068815, 1607232.3118931183],
  [87.3, -120.0, EARTH_CRS_UPS_NORTH, 1740350.3900162918, 2149908.7722190754],
  [84.0, 179.0, EARTH_CRS_UPS_NORTH, 2011636.0028676894, 2666626.1578253387],
  [-85.0, -45.0, EARTH_CRS_UPS_SOUTH, 1607232.3118931183, 2392767.6881068815],
  [-85.0, 45.0, EARTH_CRS_UPS_SOUTH, 2392767.6881068815, 2392767.6881068815],
  [-80.5, -100.0, EARTH_CRS_UPS_SOUTH, 959007.4214321773, 1816444.9216812165],
  [-88.0, 160.0, EARTH_CRS_UPS_SOUTH, 2075952.1631872612, 1791323.146684267],
  [90.0, 0.0, EARTH_CRS_UPS_NORTH, 2000000, 2000000],
  [-90.0, 0.0, EARTH_CRS_UPS_SOUTH, 2000000, 2000000],
];

describe("projectEarthLatLon", () => {
  test.each(PYPROJ_CASES)("matches pyproj at %s, %s within 1 µm", (lat, lon, crs, e, n) => {
    expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
    expect(Math.abs(out[0] - e)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(out[1] - n)).toBeLessThanOrEqual(1e-6);
  });

  test("equals the proj4 converter bit for bit", () => {
    const random = createSeededRandom(32661);
    for (let crs = 0; crs <= 121; crs++) {
      const converter = proj4("EPSG:4326", getEarthProj4Definition(crs) as string);
      for (let i = 0; i < 40; i++) {
        let lat: number;
        let lon: number;
        if (crs <= 1) {
          lat = (crs === 1 ? 1 : -1) * (80 + random() * 10);
          lon = random() * 360 - 180;
        } else {
          const zone = Math.floor((crs - 2) / 2) + 1;
          lat = ((crs - 2) % 2 === 1 ? -1 : 1) * random() * 80;
          lon = (zone - 1) * 6 - 180 + random() * 6;
        }
        const expected = converter.forward([lon, lat]);
        expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
        expect(out[0]).toBe(expected[0]);
        expect(out[1]).toBe(expected[1]);
        const inverse = converter.inverse([out[0], out[1]]);
        expect(unprojectEarthToLatLon(out[0], out[1], crs, back)).toBe(true);
        expect(back[0]).toBe(inverse[1]);
        expect(back[1]).toBe(inverse[0] >= 180 ? inverse[0] - 360 : inverse[0]);
      }
    }
  });

  test("projects into a neighbouring zone", () => {
    expect(projectEarthLatLon(29.5593, -95.09, utm(14), out)).toBe(true);
    expect(out[0]).toBeGreaterThan(800000);
    expect(projectEarthLatLon(29.5593, -95.09, utm(15, "S"), out)).toBe(true);
    expect(out[1]).toBeCloseTo(3271776.2297767177 + 10000000, 6);
  });

  test("conforms longitude before projecting", () => {
    projectEarthLatLon(10, -179.5, utm(1), out);
    const [e, n] = out;
    expect(projectEarthLatLon(10, 180.5, utm(1), out)).toBe(true);
    expect([out[0], out[1]]).toEqual([e, n]);
  });

  test("rejects invalid input and unprojectable points", () => {
    expect(projectEarthLatLon(91, 0, utm(1), out)).toBe(false);
    expect(projectEarthLatLon(NaN, 0, utm(1), out)).toBe(false);
    expect(projectEarthLatLon(0, Infinity, utm(1), out)).toBe(false);
    expect(projectEarthLatLon(0, 0, -1, out)).toBe(false);
    expect(projectEarthLatLon(0, 0, 122, out)).toBe(false);
    // 90° from the central meridian.
    expect(projectEarthLatLon(0, -87, utm(1), out)).toBe(false);
    expect(unprojectEarthToLatLon(NaN, 0, utm(1), out)).toBe(false);
    expect(unprojectEarthToLatLon(0, 0, -1, out)).toBe(false);
    expect(unprojectEarthToLatLon(1e9, 0, utm(1), out)).toBe(false);
  });
});

describe("unprojectEarthToLatLon", () => {
  test("round-trips within 1 µm", () => {
    const random = createSeededRandom(4326);
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const lat = random() * 180 - 90;
      const lon = random() * 360 - 180;
      const crs = classifyEarthLatLon(lat, lon);
      expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
      const e = out[0];
      const n = out[1];
      expect(unprojectEarthToLatLon(e, n, crs, back)).toBe(true);
      expect(projectEarthLatLon(back[0], back[1], crs, out)).toBe(true);
      worst = Math.max(worst, Math.abs(out[0] - e), Math.abs(out[1] - n));
      expect(back[1]).toBeGreaterThanOrEqual(-180);
      expect(back[1]).toBeLessThan(180);
    }
    expect(worst).toBeLessThanOrEqual(1e-6);
  });

  test("inverts the pyproj cases", () => {
    for (const [lat, lon, crs, e, n] of PYPROJ_CASES) {
      expect(unprojectEarthToLatLon(e, n, crs, back)).toBe(true);
      expect(back[0]).toBeCloseTo(lat, 9);
      if (Math.abs(lat) < 90) expect(back[1]).toBeCloseTo(lon, 9);
    }
  });

  test("returns the pole for the UPS origin", () => {
    expect(unprojectEarthToLatLon(2000000, 2000000, EARTH_CRS_UPS_NORTH, back)).toBe(true);
    expect(back[0]).toBe(90);
    expect(unprojectEarthToLatLon(2000000, 2000000, EARTH_CRS_UPS_SOUTH, back)).toBe(true);
    expect(back[0]).toBe(-90);
  });
});

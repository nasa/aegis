import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { getFixedGridSpacings } from "utils/lgrs/grid/plan";
import { getLtmCrsId, LGRS_CRS_LPS_NORTH, LGRS_CRS_LPS_SOUTH } from "utils/lgrs/moon/crs";
import { moonGridSystem } from "utils/lgrs/moon/system";
import {
  getGridSystem,
  getMissionCoordinateSystem,
  getMissionGridSystem,
  getMissionGridSystemId,
  resolveMissionGridSystem,
} from "utils/lgrs/system";

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const base: LgrsMissionGridFields = {
  id: 3,
  planetRadius: 1737400,
  projIsCustom: true,
  projEpsg: "IAU:30135",
  projProj4String: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
};

describe("getMissionGridSystem", () => {
  test("resolves every mission to the Moon", () => {
    expect(getMissionGridSystemId(base)).toBe("moon-m2025");
    expect(getMissionGridSystem(base).system).toBe(moonGridSystem);
    expect(resolveMissionGridSystem(base)).toBe(moonGridSystem);
    expect(getMissionGridSystem({ ...base, planetRadius: 6378137 }).system).toBe(moonGridSystem);
  });

  test("keeps the lunar ACC scheme whatever the override", () => {
    expect(getMissionGridSystem(base, "mgrs").system).toBe(moonGridSystem);
    expect(resolveMissionGridSystem(base, "lunar-acc")).toBe(moonGridSystem);
    expect(moonGridSystem.scheme).toBe("lunar-acc");
  });

  test.each([
    ["the canonical south cap", base],
    ["Web Mercator", { ...base, projIsCustom: false, projEpsg: "EPSG:3857" }],
    ["an Earth radius", { ...base, planetRadius: 6378137 }],
    ["a missing radius", { ...base, planetRadius: null }],
    ["an unparseable projection", { ...base, projProj4String: "+proj=notaprojection" }],
  ])("computes today's compatibility for %s", (_name, mission) => {
    expect(getMissionGridSystem(mission).compatibility).toEqual(
      getLgrsCompatibility(moonGridSystem, mission)
    );
  });

  test("reports why a mission is incompatible", () => {
    expect(getMissionGridSystem(base).compatibility.compatible).toBe(true);
    expect(getMissionGridSystem({ ...base, planetRadius: 1737000 }).compatibility).toMatchObject({
      compatible: false,
      reason: expect.stringMatching(/radius/),
      projection: null,
    });
  });
});

describe("getMissionCoordinateSystem", () => {
  test("is the grid system only when the mission shows grid coordinates", () => {
    expect(getMissionCoordinateSystem({ usingLGRSCoordinates: true })).toBe(moonGridSystem);
    expect(getMissionCoordinateSystem({ usingLGRSCoordinates: false })).toBeNull();
  });
});

describe("getGridSystem", () => {
  test("returns the Moon and rejects systems that are not available", () => {
    expect(getGridSystem("moon-m2025", "lunar-acc")).toBe(moonGridSystem);
    expect(() => getGridSystem("earth-wgs84", "mgrs")).toThrow(/earth-wgs84/);
  });
});

describe("moonGridSystem", () => {
  test("identifies itself", () => {
    expect(moonGridSystem.key).toBe("moon-m2025");
    expect(moonGridSystem.id).toBe("moon-m2025");
    expect(moonGridSystem.drawsZoneTier).toBe(true);
  });

  test("has the lunar box spacings and map-menu choices", () => {
    expect(moonGridSystem.getBoxSpacings()).toEqual([10, 100, 1000, 25000]);
    expect(getFixedGridSpacings(moonGridSystem)).toEqual([10, 100, 1000]);
  });

  test("validates only lunar CRS ids", () => {
    expect(moonGridSystem.isValidCrs(0) && moonGridSystem.isValidCrs(91)).toBe(true);
    expect(moonGridSystem.isValidCrs(92) || moonGridSystem.isValidCrs(-1)).toBe(false);
  });

  test("describes the LPS caps as discs around the pole", () => {
    for (const crs of [LGRS_CRS_LPS_SOUTH, LGRS_CRS_LPS_NORTH]) {
      const cap = moonGridSystem.getCap(crs);
      expect(cap).toMatchObject({ centreE: 500000, centreN: 500000 });
      // The 80° parallel projects to the cap radius.
      const out = new Float64Array(2);
      moonGridSystem.projectLatLon(crs === LGRS_CRS_LPS_SOUTH ? -80 : 80, 37, crs, out);
      expect(Math.hypot(out[0] - 500000, out[1] - 500000)).toBeCloseTo(cap.radius, 6);
    }
    expect(moonGridSystem.getCap(getLtmCrsId(23, "N"))).toBeNull();
    expect(moonGridSystem.getCentralMeridian(getLtmCrsId(23, "N"))).toBe(0);
    expect(moonGridSystem.getCentralMeridian(LGRS_CRS_LPS_SOUTH)).toBeNaN();
  });

  test("isInRegion agrees with classifyLatLon", () => {
    for (const [lat, lon] of [
      [0, 0],
      [-0.0001, 0.0001],
      [79.99, 3.99],
      [80, 10],
      [-80, -170],
      [10, 179.99],
    ]) {
      const crs = moonGridSystem.classifyLatLon(lat, lon);
      expect(moonGridSystem.isInRegion(lat, lon, crs)).toBe(true);
      expect(moonGridSystem.isInRegion(lat, lon, crs === 0 ? 1 : 0)).toBe(false);
    }
  });

  test("skips only the LTM equator as a seam grid line", () => {
    expect(moonGridSystem.isSeamGridLine(getLtmCrsId(23, "N"), "northing", 0)).toBe(true);
    expect(moonGridSystem.isSeamGridLine(getLtmCrsId(23, "S"), "northing", 2500000)).toBe(true);
    expect(moonGridSystem.isSeamGridLine(getLtmCrsId(23, "N"), "easting", 250000)).toBe(false);
    expect(moonGridSystem.isSeamGridLine(LGRS_CRS_LPS_SOUTH, "northing", 500000)).toBe(false);
  });
});

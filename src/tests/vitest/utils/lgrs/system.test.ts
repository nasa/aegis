import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";
import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";
import {
  getGridSystem,
  getMissionCoordinateSystem,
  getMissionDefaultLabelScheme,
  getMissionGridSystem,
  getMissionGridSystemId,
  getMissionLabelScheme,
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
  test("resolves a mission without a grid system to the Moon", () => {
    expect(getMissionGridSystemId(base)).toBe("moon-m2025");
    expect(getMissionGridSystem(base).system).toBe(moonGridSystem);
    expect(resolveMissionGridSystem(base)).toBe(moonGridSystem);
    expect(getMissionGridSystem({ ...base, planetRadius: 6378137 }).system).toBe(moonGridSystem);
  });

  test("keeps the lunar ACC scheme whatever the override", () => {
    expect(getMissionGridSystem(base, "mgrs").system).toBe(moonGridSystem);
    expect(resolveMissionGridSystem(base, "lunar-acc")).toBe(moonGridSystem);
    expect(moonGridSystem.scheme).toBe("lunar-acc");
    const lunar = { ...base, gridSystem: "moon-m2025", earthGridLabelScheme: "mgrs" } as const;
    expect(getMissionGridSystem(lunar, "mgrs").system).toBe(moonGridSystem);
    expect(getMissionDefaultLabelScheme(lunar)).toBe("lunar-acc");
  });

  test("reads the mission's grid system and default label scheme", () => {
    expect(getMissionGridSystemId({ gridSystem: "earth-wgs84" })).toBe("earth-wgs84");
    expect(getMissionGridSystemId({ gridSystem: "moon-m2025" })).toBe("moon-m2025");
    expect(getMissionGridSystemId({})).toBe("moon-m2025");
    expect(getMissionDefaultLabelScheme({ gridSystem: "earth-wgs84" })).toBe("lunar-acc");
    expect(
      getMissionDefaultLabelScheme({ gridSystem: "earth-wgs84", earthGridLabelScheme: "mgrs" })
    ).toBe("mgrs");
  });

  test("labels Earth in the user override, else the mission default, and the Moon in ACC", () => {
    const earth = { gridSystem: "earth-wgs84", earthGridLabelScheme: "mgrs" } as const;
    expect(getMissionLabelScheme(earth)).toBe("mgrs");
    expect(getMissionLabelScheme(earth, null)).toBe("mgrs");
    expect(getMissionLabelScheme(earth, "lunar-acc")).toBe("lunar-acc");
    expect(getMissionLabelScheme({ gridSystem: "earth-wgs84" }, "mgrs")).toBe("mgrs");
    expect(getMissionLabelScheme({ gridSystem: "earth-wgs84" })).toBe("lunar-acc");
    expect(getMissionLabelScheme({ ...earth, gridSystem: "moon-m2025" }, "mgrs")).toBe("lunar-acc");
    expect(getMissionLabelScheme({}, "mgrs")).toBe("lunar-acc");
  });

  // Depends on the Earth grid system (`getGridSystem("earth-wgs84", scheme)`).
  test("labels Earth missions in the user override, else the mission default", () => {
    const earth = { ...base, planetRadius: 6378137, gridSystem: "earth-wgs84" } as const;
    expect(resolveMissionGridSystem(earth)).toBe(getGridSystem("earth-wgs84", "lunar-acc"));
    expect(resolveMissionGridSystem({ ...earth, earthGridLabelScheme: "mgrs" })).toBe(
      getGridSystem("earth-wgs84", "mgrs")
    );
    expect(resolveMissionGridSystem({ ...earth, earthGridLabelScheme: "mgrs" }, null).scheme).toBe(
      "mgrs"
    );
    expect(
      resolveMissionGridSystem({ ...earth, earthGridLabelScheme: "mgrs" }, "lunar-acc").scheme
    ).toBe("lunar-acc");
    expect(resolveMissionGridSystem(earth, "mgrs").scheme).toBe("mgrs");
    expect(getMissionGridSystem(earth, "mgrs").system.id).toBe("earth-wgs84");
    // JSC, from the plan's worked examples.
    expect(resolveMissionGridSystem(earth).formatPoint(29.5593, -95.09, 10, "full")).toBe(
      "15RTNDC X51 W77"
    );
    expect(resolveMissionGridSystem(earth, "mgrs").formatPoint(29.5593, -95.09, 10, "full")).toBe(
      "15R TN 9751 7177"
    );
    expect(getMissionCoordinateSystem({ ...earth, usingLGRSCoordinates: false })).toBeNull();
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
  test("returns the Moon, the Earth per scheme, and rejects unknown systems", () => {
    expect(getGridSystem("moon-m2025", "lunar-acc")).toBe(moonGridSystem);
    expect(getGridSystem("earth-wgs84", "mgrs")).toBe(getEarthGridSystem("mgrs"));
    expect(getGridSystem("earth-wgs84", "lunar-acc")).toBe(getEarthGridSystem("lunar-acc"));
    expect(() => getGridSystem("mars" as MissionGridSystemId, "mgrs")).toThrow(/mars/);
  });
});

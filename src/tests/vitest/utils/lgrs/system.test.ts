import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";
import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";
import {
  getGridSystem,
  getMissionCoordinateSystem,
  getMissionGridSystem,
  getMissionGridSystemId,
  getMissionLabelScheme,
  resolveMissionGridSystem,
} from "utils/lgrs/system";

const base: LgrsMissionGridFields = {
  id: 3,
  planet: "moon",
  projIsCustom: false,
  projEpsg: "EPSG:3857",
  projProj4String: "",
};

describe("mission planetary grid system", () => {
  test.each([
    ["earth", "earth-wgs84"],
    ["moon", "moon-m2025"],
    ["mars", null],
  ] as const)("derives %s's system from the planet", (planet, expected) => {
    const mission = { ...base, planet };
    expect(getMissionGridSystemId(mission)).toBe(expected);
    expect(resolveMissionGridSystem(mission)?.id ?? null).toBe(expected);
    expect(getMissionCoordinateSystem({ ...mission, serverFileGrid: null })?.id ?? null).toBe(
      expected
    );
    expect(getMissionGridSystem(mission).compatibility).toEqual(
      getLgrsCompatibility(resolveMissionGridSystem(mission), mission)
    );
  });

  test("labels the Moon in ACC whatever earthGridLabelScheme", () => {
    const mission = { ...base, earthGridLabelScheme: "mgrs" } as const;
    expect(resolveMissionGridSystem(mission)).toBe(moonGridSystem);
    expect(getMissionLabelScheme(mission)).toBe("lunar-acc");
  });

  test("labels Earth missions in the mission's label scheme", () => {
    const earth = { ...base, planet: "earth" } as const;
    expect(resolveMissionGridSystem(earth)).toBe(getEarthGridSystem("lunar-acc"));
    expect(resolveMissionGridSystem({ ...earth, earthGridLabelScheme: "mgrs" })).toBe(
      getEarthGridSystem("mgrs")
    );
    expect(getMissionLabelScheme({ ...earth, earthGridLabelScheme: "mgrs" })).toBe("mgrs");
    // JSC, from the plan's worked examples.
    expect(resolveMissionGridSystem(earth)?.formatPoint(29.5593, -95.09, 10, "full")).toBe(
      "15RTNDC X51 W77"
    );
    expect(
      resolveMissionGridSystem({ ...earth, earthGridLabelScheme: "mgrs" })?.formatPoint(
        29.5593,
        -95.09,
        10,
        "full"
      )
    ).toBe("15R TN 9751 7177");
  });

  test("does not silently give unsupported bodies a lunar grid", () => {
    const mission = { ...base, planet: "mars" } as const;
    expect(resolveMissionGridSystem(mission)).toBeNull();
    expect(getMissionGridSystem(mission)).toMatchObject({
      system: null,
      compatibility: { compatible: false, projection: null },
    });
  });

  test("reports an unparseable map projection", () => {
    expect(
      getMissionGridSystem({ ...base, projIsCustom: true, projProj4String: "+proj=invalid" })
        .compatibility.compatible
    ).toBe(false);
  });

  test("returns library instances and rejects unknown grid systems", () => {
    expect(getGridSystem("moon-m2025", "lunar-acc")).toBe(moonGridSystem);
    expect(getGridSystem("earth-wgs84", "mgrs")).toBe(getEarthGridSystem("mgrs"));
    expect(() => getGridSystem("mars" as MissionGridSystemId, "mgrs")).toThrow(/mars/);
  });
});

test("uploaded Earth grids use custom coordinates while retaining the planetary reference system", () => {
  const mission = {
    ...base,
    planet: "earth",
    serverFileGrid: { name: "USGS", fileName: "usgs.json", numRows: 2, numCols: 2 },
  } as const;
  expect(resolveMissionGridSystem(mission)?.id).toBe("earth-wgs84");
  expect(getMissionCoordinateSystem(mission)).toBeNull();
  expect(getMissionCoordinateSystem({ ...mission, serverFileGrid: null })?.id).toBe("earth-wgs84");
});

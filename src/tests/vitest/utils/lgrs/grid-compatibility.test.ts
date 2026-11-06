import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { moonGridSystem } from "utils/lgrs/moon/system";

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SOUTH_CAP = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;

const base = {
  id: 3,
  planetRadius: 1737400,
  projIsCustom: true,
  projEpsg: "IAU:30135",
  projProj4String: SOUTH_CAP,
};

describe("getLgrsCompatibility", () => {
  test("allows the canonical south cap and other lunar projections", () => {
    expect(getLgrsCompatibility(moonGridSystem, base)).toMatchObject({
      compatible: true,
      projection: { projCode: "IAU:30135", proj4Def: SOUTH_CAP },
    });
    expect(
      getLgrsCompatibility(moonGridSystem, {
        ...base,
        projProj4String: `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
      }).compatible
    ).toBe(true);
    expect(
      getLgrsCompatibility(moonGridSystem, {
        ...base,
        projEpsg: "IAU:30110",
        projProj4String: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`,
      }).compatible
    ).toBe(true);
  });

  test("allows the default Web Mercator map of a lunar mission (Apollo 14 seed)", () => {
    expect(
      getLgrsCompatibility(moonGridSystem, { ...base, projIsCustom: false, projEpsg: "EPSG:3857" })
    ).toMatchObject({ compatible: true, projection: { projCode: "EPSG:3857", proj4Def: null } });
  });

  test("requires exactly the lunar sphere radius", () => {
    for (const planetRadius of [1737000, 1737400.5, null]) {
      const result = getLgrsCompatibility(moonGridSystem, { ...base, planetRadius });
      expect(result.compatible).toBe(false);
      expect(result.projection).toBeNull();
      expect(result.reason).toMatch(/radius/);
    }
  });

  test("requires a projection proj4 can parse", () => {
    const result = getLgrsCompatibility(moonGridSystem, {
      ...base,
      projProj4String: "+proj=notaprojection",
    });
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/proj4/);
  });
});

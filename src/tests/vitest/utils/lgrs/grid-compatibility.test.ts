import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SOUTH_CAP = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;

const base = {
  id: 3,
  planet: "moon" as const,
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

  test("rejects a grid system for another planet", () => {
    const result = getLgrsCompatibility(moonGridSystem, { ...base, planet: "earth" });
    expect(result).toMatchObject({ compatible: false, projection: null });
    expect(result.reason).toMatch(/radius/);
  });

  test("requires a projection proj4 can parse", () => {
    const result = getLgrsCompatibility(moonGridSystem, {
      ...base,
      projProj4String: "+proj=notaprojection",
    });
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/proj4/);
  });

  test("reports no warning for the Moon", () => {
    expect(getLgrsCompatibility(moonGridSystem, base).warning).toBeNull();
    expect(getLgrsCompatibility(moonGridSystem, { ...base }).warning).toBeNull();
  });

  describe("on earth-wgs84", () => {
    const radiusWarning = "Not an Earth radius.";
    const earthLike: LgrsGridSystem = {
      ...moonGridSystem,
      key: "earth-wgs84/test",
      id: "earth-wgs84",
      checkPlanetRadius: (planetRadius) => (planetRadius > 4000000 ? null : radiusWarning),
    };
    const webMercator = {
      ...base,
      planet: "earth" as const,
      projIsCustom: false,
      projEpsg: "EPSG:3857",
    };

    test("needs only a parseable projection", () => {
      expect(getLgrsCompatibility(earthLike, webMercator)).toMatchObject({
        compatible: true,
        projection: { projCode: "EPSG:3857", proj4Def: null },
        warning: null,
      });
    });

    test("warns about a radius that is not Earth-scale without blocking", () => {
      for (const planet of ["moon", "mars"] as const) {
        expect(getLgrsCompatibility(earthLike, { ...webMercator, planet })).toMatchObject({
          compatible: true,
          warning: radiusWarning,
        });
      }
    });

    test("still requires a projection proj4 can parse", () => {
      const result = getLgrsCompatibility(earthLike, {
        ...base,
        planet: "moon" as const,
        projProj4String: "+proj=notaprojection",
      });
      expect(result).toMatchObject({ compatible: false, projection: null, warning: radiusWarning });
      expect(result.reason).toMatch(/proj4/);
    });
  });
});

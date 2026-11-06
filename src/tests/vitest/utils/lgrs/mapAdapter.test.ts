import { getLgrsMapProjection } from "utils/lgrs/mapProjection";

const SOUTH_CAP =
  "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";

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

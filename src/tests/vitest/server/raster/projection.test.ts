import { getRasterProjections } from "server/raster/projection";

describe("getRasterProjections", () => {
  it("derives the lunar south-pole stereographic projection", () => {
    const result = getRasterProjections({
      geoKeys: {
        ProjectedCSTypeGeoKey: 32767,
        ProjCoordTransGeoKey: 15,
        ProjLinearUnitsGeoKey: 9001,
        GeogSemiMajorAxisGeoKey: 1737400,
        GeogSemiMinorAxisGeoKey: 1737400,
        ProjNatOriginLatGeoKey: -90,
        ProjStraightVertPoleLongGeoKey: 0,
        ProjScaleAtNatOriginGeoKey: 1,
      },
    });

    expect(result.projection).toContain("+proj=stere");
    expect(result.projection).toContain("+lat_0=-90");
    expect(result.projection).toContain("+a=1737400 +b=1737400");
    expect(result.geographicProjection).toContain("+proj=longlat");
  });

  it("derives the Apollo 14 lunar equirectangular projection", () => {
    const result = getRasterProjections({
      geoKeys: {
        ProjectedCSTypeGeoKey: 32767,
        ProjCoordTransGeoKey: 17,
        ProjLinearUnitsGeoKey: 9001,
        GeogSemiMajorAxisGeoKey: 1737400,
        GeogSemiMinorAxisGeoKey: 1737400,
        ProjStdParallel1GeoKey: -3,
        ProjCenterLongGeoKey: 180,
        ProjCenterLatGeoKey: 0,
      },
    });

    expect(result.projection).toContain("+proj=eqc");
    expect(result.projection).toContain("+lat_ts=-3");
    expect(result.projection).toContain("+lon_0=180");
  });

  it("uses standard EPSG definitions without requiring redundant ellipsoid keys", () => {
    const result = getRasterProjections({
      geoKeys: {
        GeographicTypeGeoKey: 4326,
        ProjectedCSTypeGeoKey: 3857,
        ProjLinearUnitsGeoKey: 9001,
      },
    });

    expect(result).toEqual({
      projection: "EPSG:3857",
      geographicProjection: "EPSG:4326",
    });
  });

  it("rejects unsupported custom transforms", () => {
    expect(() =>
      getRasterProjections({
        geoKeys: {
          ProjectedCSTypeGeoKey: 32767,
          ProjCoordTransGeoKey: 999,
          GeogSemiMajorAxisGeoKey: 1737400,
        },
      })
    ).toThrow("Unsupported custom raster coordinate transform");
  });
});

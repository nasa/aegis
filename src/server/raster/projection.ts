type GeoKeys = Record<string, unknown>;

// GeoTIFF stores CRS parameters as numeric GeoKeys rather than a ready-to-use proj4 string.
const numberKey = (geoKeys: GeoKeys, key: string, fallback?: number): number => {
  const value = geoKeys[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Raster CRS is missing ${key}`);
};

const ellipsoidParameters = (geoKeys: GeoKeys): string => {
  const semiMajor = numberKey(geoKeys, "GeogSemiMajorAxisGeoKey");
  const semiMinor = numberKey(geoKeys, "GeogSemiMinorAxisGeoKey", semiMajor);
  return `+a=${semiMajor} +b=${semiMinor}`;
};

const getGeographicProjection = (geoKeys: GeoKeys): string => {
  const geographicCrs = numberKey(geoKeys, "GeographicTypeGeoKey", 32767);
  // 32767 is GeoTIFF's user-defined sentinel; other values are registered EPSG codes.
  if (geographicCrs !== 32767) return `EPSG:${geographicCrs}`;

  const ellipsoid = ellipsoidParameters(geoKeys);
  const primeMeridian = numberKey(geoKeys, "GeogPrimeMeridianLongGeoKey", 0);
  return `+proj=longlat ${ellipsoid} +pm=${primeMeridian} +no_defs`;
};

export const getRasterProjections = (
  metadata: Pick<RasterMetadata, "geoKeys">
): { projection: string; geographicProjection: string } => {
  const geoKeys = metadata.geoKeys;
  const linearUnits = numberKey(geoKeys, "ProjLinearUnitsGeoKey", 9001);
  if (linearUnits !== 9001) throw new Error("Raster CRS linear units must be metres");

  const projectedCrs = numberKey(geoKeys, "ProjectedCSTypeGeoKey", 32767);
  const geographicProjection = getGeographicProjection(geoKeys);
  if (projectedCrs !== 32767) {
    // A registered CRS lets proj4 obtain the complete projection definition from its EPSG entry.
    return { projection: `EPSG:${projectedCrs}`, geographicProjection };
  }

  // Lunar products commonly use custom ellipsoids and therefore carry projection parameters
  // directly in the GeoTIFF. Build only the transforms emitted by the supported data pipeline.
  const ellipsoid = ellipsoidParameters(geoKeys);
  const falseEasting = numberKey(geoKeys, "ProjFalseEastingGeoKey", 0);
  const falseNorthing = numberKey(geoKeys, "ProjFalseNorthingGeoKey", 0);
  const transform = numberKey(geoKeys, "ProjCoordTransGeoKey");

  if (transform === 15) {
    // GeoTIFF coordinate transformation code 15 is polar stereographic.
    const latitudeOrigin = numberKey(geoKeys, "ProjNatOriginLatGeoKey");
    const centralMeridian = numberKey(geoKeys, "ProjStraightVertPoleLongGeoKey", 0);
    const scale = numberKey(geoKeys, "ProjScaleAtNatOriginGeoKey", 1);
    return {
      projection: `+proj=stere +lat_0=${latitudeOrigin} +lon_0=${centralMeridian} +k=${scale} +x_0=${falseEasting} +y_0=${falseNorthing} ${ellipsoid} +units=m +no_defs`,
      geographicProjection,
    };
  }

  if (transform === 17) {
    // GeoTIFF coordinate transformation code 17 is equirectangular.
    const standardParallel = numberKey(geoKeys, "ProjStdParallel1GeoKey", 0);
    const latitudeOrigin = numberKey(geoKeys, "ProjCenterLatGeoKey", 0);
    const centralMeridian = numberKey(geoKeys, "ProjCenterLongGeoKey", 0);
    return {
      projection: `+proj=eqc +lat_ts=${standardParallel} +lat_0=${latitudeOrigin} +lon_0=${centralMeridian} +x_0=${falseEasting} +y_0=${falseNorthing} ${ellipsoid} +units=m +no_defs`,
      geographicProjection,
    };
  }

  throw new Error(`Unsupported custom raster coordinate transform ${transform}`);
};

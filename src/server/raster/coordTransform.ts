import proj4 from "proj4";

export const geographicToPixel = (
  point: GeographicPoint,
  rasterProjection: string,
  origin: readonly [number, number],
  resolution: readonly [number, number],
  geographicProjection = "+proj=longlat +datum=WGS84 +no_defs"
): PixelPoint => {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw new Error("Geographic coordinates must be finite numbers");
  }

  // API callers supply longitude/latitude, but GeoTIFF pixels are addressed in the raster's
  // projected coordinate system (usually metres from the projection origin).
  const [projectedX, projectedY] = proj4(geographicProjection, rasterProjection, [
    point.lng,
    point.lat,
  ]);
  // GeoTIFF origin is the upper-left pixel corner. Y resolution is commonly negative because
  // projected northing increases upward while image row numbers increase downward.
  const pixelX = (projectedX - origin[0]) / resolution[0];
  const pixelY = (projectedY - origin[1]) / resolution[1];
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
    throw new Error("Coordinate transformation produced a non-finite raster position");
  }

  // Sampling is nearest-cell lookup rather than interpolation between elevation cells.
  return { x: Math.trunc(pixelX), y: Math.trunc(pixelY) };
};

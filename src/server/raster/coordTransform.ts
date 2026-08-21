import proj4 from "proj4";

import type { GeographicPoint, PixelPoint } from "./types";

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

  const [projectedX, projectedY] = proj4(geographicProjection, rasterProjection, [
    point.lng,
    point.lat,
  ]);
  const pixelX = (projectedX - origin[0]) / resolution[0];
  const pixelY = (projectedY - origin[1]) / resolution[1];
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
    throw new Error("Coordinate transformation produced a non-finite raster position");
  }

  return { x: Math.trunc(pixelX), y: Math.trunc(pixelY) };
};

import proj4 from "proj4";

import type { GeographicPoint, PixelPoint } from "./types";

export const geographicToPixel = (
  point: GeographicPoint,
  rasterProjection: string,
  origin: readonly [number, number],
  resolution: readonly [number, number]
): PixelPoint => {
  if (resolution[0] === 0 || resolution[1] === 0) {
    throw new Error("Raster resolution must be non-zero");
  }

  const [projectedX, projectedY] = proj4("EPSG:4326", rasterProjection, [point.lng, point.lat]);
  const pixelX = (projectedX - origin[0]) / resolution[0];
  const pixelY = (projectedY - origin[1]) / resolution[1];

  return {
    x: Math.trunc(Number.isFinite(pixelX) ? pixelX : 0),
    y: Math.trunc(Number.isFinite(pixelY) ? pixelY : 0),
  };
};

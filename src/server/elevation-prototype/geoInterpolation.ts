import type { GeographicPoint } from "./types";

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export const intermediatePoint = (
  start: GeographicPoint,
  end: GeographicPoint,
  fraction: number
): GeographicPoint => {
  if (fraction === 0) return { ...start };
  if (fraction === 1) return { ...end };

  const lon1 = toRadians(start.lng);
  const lat1 = toRadians(start.lat);
  const lon2 = toRadians(end.lng);
  const lat2 = toRadians(end.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  if (delta === 0) return { ...start };

  const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
  const b = Math.sin(fraction * delta) / Math.sin(delta);
  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  return {
    lat: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lng: toDegrees(Math.atan2(y, x)),
  };
};

export const interpolateSegment = (
  start: GeographicPoint,
  end: GeographicPoint,
  steps: number
): GeographicPoint[] => {
  if (steps <= 1) return [{ ...start }, { ...end }];

  return Array.from({ length: steps }, (_, index) =>
    intermediatePoint(start, end, index / (steps - 1))
  );
};

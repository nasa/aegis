import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

/**
 * Douglas–Peucker in a local tangent plane (metres). The first and last vertices are
 * always kept.
 */
export function simplifyPath(
  path: readonly AEGISPoint[],
  toleranceM: number,
  radius: number
): AEGISPoint[] {
  if (path.length <= 2) return path.map((p) => ({ lat: p.lat, lng: p.lng }));
  const rad = Math.PI / 180;
  const cosLat = Math.cos(path[0].lat * rad);
  const xy = path.map((p) => [
    (p.lng - path[0].lng) * rad * radius * cosLat,
    (p.lat - path[0].lat) * rad * radius,
  ]);

  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const dx = xy[b][0] - ax;
    const dy = xy[b][1] - ay;
    const len = Math.hypot(dx, dy);
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = a + 1; i < b; i++) {
      const d =
        len === 0
          ? Math.hypot(xy[i][0] - ax, xy[i][1] - ay)
          : Math.abs((xy[i][0] - ax) * dy - (xy[i][1] - ay) * dx) / len;
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxDist > toleranceM) {
      keep[maxIndex] = 1;
      stack.push([a, maxIndex], [maxIndex, b]);
    }
  }
  return path.filter((_, i) => keep[i]).map((p) => ({ lat: p.lat, lng: p.lng }));
}

/** Simplifies, then replaces the ends with `start` and `end` (e.g. the exact stations). */
export function simplifyPathToEndpoints(
  path: readonly AEGISPoint[],
  toleranceM: number,
  radius: number,
  start: AEGISPoint,
  end: AEGISPoint
): AEGISPoint[] {
  if (path.length < 2) return [start, end].map((p) => ({ lat: p.lat, lng: p.lng }));
  const simplified = simplifyPath(path, toleranceM, radius);
  simplified[0] = { lat: start.lat, lng: start.lng };
  simplified[simplified.length - 1] = { lat: end.lat, lng: end.lng };
  return simplified;
}

/** Great-circle length of each segment. */
export function pathSegmentDistances(path: readonly AEGISPoint[], radius: number): number[] {
  const distances: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    distances.push(getDistanceBetweenTwoCoordinates(path[i], path[i + 1], radius) ?? 0);
  }
  return distances;
}

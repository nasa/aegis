import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

/** Waypoints are rounded to 1e-7° before they are sent to Newton or compared. */
export const TRAVERSE_PATH_ROUND_DIGITS = 7;

/** Traverses with endpoints closer than this are never planned. */
export const TRAVERSE_PATH_MIN_LENGTH_M = 1;

/** Browser poll interval while any row is unfinished. */
export const TRAVERSE_PATH_POLL_MS = 10_000;

const FINISHED_STATUSES: ReadonlySet<TraversePathStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);

export function roundCoord(value: number): number {
  const factor = 10 ** TRAVERSE_PATH_ROUND_DIGITS;
  return Math.round(value * factor) / factor;
}

export function isLocated(point: AEGISPoint | undefined | null): point is AEGISPoint {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

/** True when both points are located and equal after rounding. */
export function roundedPointsEqual(
  a: AEGISPoint | undefined | null,
  b: AEGISPoint | undefined | null
): boolean {
  if (!isLocated(a) || !isLocated(b)) return false;
  return roundCoord(a.lat) === roundCoord(b.lat) && roundCoord(a.lng) === roundCoord(b.lng);
}

/** A row applies when it was planned for the traverse's current endpoints. */
export function rowApplies(row: TraversePathRow, target: TraversePathTarget): boolean {
  return (
    roundedPointsEqual(row.startPoint, target.start) && roundedPointsEqual(row.endPoint, target.end)
  );
}

export function isRowFinished(row: TraversePathRow): boolean {
  return FINISHED_STATUSES.has(row.status);
}

/** Split a traverse's rows into those that apply and a count of stale ones. */
export function splitRowsForTarget(
  rows: readonly TraversePathRow[] | undefined,
  target: TraversePathTarget
): TraversePathRowsForTraverse {
  const applying: TraversePathRow[] = [];
  let staleCount = 0;
  for (const row of rows ?? []) {
    if (rowApplies(row, target)) applying.push(row);
    else staleCount++;
  }
  applying.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { applying, staleCount };
}

/** Only Newton `v1:` hashes are comparable across rows. */
export function comparableHash(row: TraversePathRow): string | null {
  return row.requestHash?.startsWith("v1:") ? row.requestHash : null;
}

/** Group rows that share a comparable hash; other rows stay in their own group. */
export function groupRowsByHash(rows: readonly TraversePathRow[]): TraversePathRow[][] {
  const groups: TraversePathRow[][] = [];
  const byHash = new Map<string, TraversePathRow[]>();
  for (const row of rows) {
    const hash = comparableHash(row);
    if (!hash) {
      groups.push([row]);
      continue;
    }
    const existing = byHash.get(hash);
    if (existing) {
      existing.push(row);
    } else {
      const group = [row];
      byHash.set(hash, group);
      groups.push(group);
    }
  }
  return groups;
}

/** Convert a GeoJSON `[lng, lat]` LineString to AEGIS points. */
export function lineStringToPoints(line: TraversePathLineString | null): AEGISPoint[] {
  if (line?.type !== "LineString" || !Array.isArray(line.coordinates)) return [];
  return line.coordinates
    .filter((c) => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]))
    .map(([lng, lat]) => ({ lat, lng }));
}

export function pathLengthMeters(path: readonly AEGISPoint[], radius: number): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += getDistanceBetweenTwoCoordinates(path[i], path[i + 1], radius) ?? 0;
  }
  return total;
}

/** A displayable candidate for a succeeded row, or null. */
export function rowToCandidate(row: TraversePathRow, radius: number): TraversePathCandidate | null {
  if (row.status !== "succeeded") return null;
  const path = lineStringToPoints(row.path);
  if (path.length < 2) return null;
  return { row, path, distanceMeters: pathLengthMeters(path, radius) };
}

/** User-facing error text, without Newton's exception class prefix. */
export function rowErrorMessage(row: TraversePathRow): string | null {
  const message = row.error?.message;
  if (!message) return null;
  return message.replace(/^ArgumentError:\s*/, "");
}

export function rowStatusLabel(status: TraversePathStatus): string {
  switch (status) {
    case "submitting":
      return "Submitting";
    case "pending":
      return "Queued";
    case "in_progress":
      return "Planning";
    case "succeeded":
      return "Ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

export function rowMapNames(row: TraversePathRow, type: TraversePathMapInfo["type"]): string[] {
  return (row.mapInfo ?? []).filter((m) => m.type === type).map((m) => m.name);
}

/** Reads the configured source, with a localStorage override for quick switching. */
export function getTraversePathSource(): TraversePathSource {
  const valid = (v: unknown): v is TraversePathSource => v === "off" || v === "mock" || v === "api";
  try {
    const override = globalThis.localStorage?.getItem("aegisTraversePathSource");
    if (valid(override)) return override;
  } catch {
    /* localStorage unavailable */
  }
  const fromEnv: unknown = import.meta.env.VITE_PUBLIC_TRAVERSE_PATH_SOURCE;
  return valid(fromEnv) ? fromEnv : "off";
}

/**
 * Douglas–Peucker in a local tangent plane (metres), then the first and last
 * vertices are replaced with the exact station locations.
 */
export function simplifyPathToEndpoints(
  path: readonly AEGISPoint[],
  toleranceM: number,
  radius: number,
  start: AEGISPoint,
  end: AEGISPoint
): AEGISPoint[] {
  if (path.length < 2) return [start, end];
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
    const len = Math.hypot(dx, dy) || 1;
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((xy[i][0] - ax) * dy - (xy[i][1] - ay) * dx) / len;
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

  const simplified = path.filter((_, i) => keep[i]).map((p) => ({ lat: p.lat, lng: p.lng }));
  simplified[0] = { lat: start.lat, lng: start.lng };
  simplified[simplified.length - 1] = { lat: end.lat, lng: end.lng };
  return simplified;
}

/** Simplification tolerance: half the slope map's resolution (default 1 m/px). */
export function rowSimplifyToleranceM(row: TraversePathRow): number {
  const slope = row.mapInfo?.find((m) => m.type === "slope");
  const res = slope?.resolution?.[0];
  return (Number.isFinite(res) && res > 0 ? res : 1) * 0.5;
}

/** The path a succeeded row would write to the doc, with per-segment distances. */
export function buildTraversePathPreview(
  row: TraversePathRow,
  target: TraversePathTarget,
  radius: number
): TraversePathPreview | null {
  if (row.status !== "succeeded" || !isLocated(target.start) || !isLocated(target.end)) {
    return null;
  }
  const raw = lineStringToPoints(row.path);
  if (raw.length < 2) return null;
  const path = simplifyPathToEndpoints(
    raw,
    rowSimplifyToleranceM(row),
    radius,
    target.start,
    target.end
  );
  const segmentDistances: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    segmentDistances.push(getDistanceBetweenTwoCoordinates(path[i], path[i + 1], radius) ?? 0);
  }
  return { rowUuid: row.uuid, path, segmentDistances, rawVertexCount: raw.length };
}

/** Feature id of the manual-path candidate drawn while a Newton path is previewed. */
export function manualCandidateId(traverseUuid: string): string {
  return `manual-${traverseUuid}`;
}

/**
 * The traverse as it would look with the preview applied. Elevation and slope
 * profiles are cleared because they belong to the doc path.
 */
export function applyTraversePathPreview(
  traverse: Traverse,
  preview: TraversePathPreview | undefined
): Traverse {
  if (!traverse || !preview) return traverse;
  return {
    ...traverse,
    path: preview.path,
    pathSegmentDistances: preview.segmentDistances,
    pathSegmentElevations: null,
    pathSegmentAbsoluteSlopes: null,
  };
}

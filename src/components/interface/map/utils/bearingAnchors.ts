/**
 * Bearing labels spaced evenly along a traverse path ("Along Path" mode).
 *
 * Dense paths (e.g. Newton A* paths) have many short segments, so one label per
 * segment overlaps. Anchors are placed every `spacingM` of path distance, each
 * with the bearing of a chord ±`chordM` around it, which smooths over pixel
 * stair-steps. The style function then keeps a subset spaced for the zoom.
 */

import type { Coordinate } from "ol/coordinate";

import { getDistanceBetweenTwoCoordinates, getSegmentBearing } from "utils/mapping/geoMath";

export type BearingAnchor = {
  coord: Coordinate;
  /** Bearing in degrees, in the mission's bearing frame. */
  bearing: number;
  /** Direction of travel in map coordinates (radians from +x), for label rotation. */
  angle: number;
  /** Distance from the path start in map units, for zoom-based thinning. */
  mapDistance: number;
};

export const BEARING_ANCHOR_SPACING_M = 10;
export const BEARING_ANCHOR_CHORD_M = 10;
export const BEARING_ANCHOR_END_SKIP_M = 5;
export const BEARING_LABEL_MIN_SPACING_PX = 120;

type Options = {
  radius: number;
  usingLGRSCoordinates: boolean;
  toMapCoord: (point: AEGISPoint) => Coordinate;
  spacingM?: number;
  chordM?: number;
  endSkipM?: number;
};

function lerpPoint(a: AEGISPoint, b: AEGISPoint, t: number): AEGISPoint {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Point at `distance` metres along the path, from cumulative vertex distances. */
function pointAtDistance(path: AEGISPoint[], cumulative: number[], distance: number): AEGISPoint {
  const total = cumulative[cumulative.length - 1];
  const d = Math.min(Math.max(distance, 0), total);
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < d) i++;
  const segLength = cumulative[i] - cumulative[i - 1];
  const t = segLength > 0 ? (d - cumulative[i - 1]) / segLength : 0;
  return lerpPoint(path[i - 1], path[i], t);
}

export function buildBearingAnchors(path: AEGISPoint[], opts: Options): BearingAnchor[] {
  const spacing = opts.spacingM ?? BEARING_ANCHOR_SPACING_M;
  const chord = opts.chordM ?? BEARING_ANCHOR_CHORD_M;
  const endSkip = opts.endSkipM ?? BEARING_ANCHOR_END_SKIP_M;
  const valid = path.filter((p) => p?.lat != null && p?.lng != null);
  if (valid.length < 2) return [];

  const cumulative = [0];
  for (let i = 1; i < valid.length; i++) {
    const d = getDistanceBetweenTwoCoordinates(valid[i - 1], valid[i], opts.radius) ?? 0;
    cumulative.push(cumulative[i - 1] + d);
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 2 * endSkip) return [];

  // Anchors are centred in the usable span so short paths still get one label.
  const usable = total - 2 * endSkip;
  const count = Math.floor(usable / spacing) + 1;
  const offset = endSkip + (usable - (count - 1) * spacing) / 2;

  const anchors: BearingAnchor[] = [];
  let lastCoord: Coordinate | null = null;
  let mapDistance = 0;
  for (let n = 0; n < count; n++) {
    const d = offset + n * spacing;
    const point = pointAtDistance(valid, cumulative, d);
    const before = pointAtDistance(valid, cumulative, d - chord);
    const after = pointAtDistance(valid, cumulative, d + chord);
    const coord = opts.toMapCoord(point);
    const a = opts.toMapCoord(before);
    const b = opts.toMapCoord(after);
    if (lastCoord) mapDistance += Math.hypot(coord[0] - lastCoord[0], coord[1] - lastCoord[1]);
    lastCoord = coord;
    anchors.push({
      coord,
      bearing: getSegmentBearing(before, after, opts.usingLGRSCoordinates),
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      mapDistance,
    });
  }
  return anchors;
}

/** Anchors at least `minSpacing` map units apart, keeping the first. */
export function thinBearingAnchors(
  anchors: readonly BearingAnchor[],
  minSpacing: number
): BearingAnchor[] {
  const kept: BearingAnchor[] = [];
  let last = -Infinity;
  for (const anchor of anchors) {
    if (anchor.mapDistance - last >= minSpacing) {
      kept.push(anchor);
      last = anchor.mapDistance;
    }
  }
  return kept;
}

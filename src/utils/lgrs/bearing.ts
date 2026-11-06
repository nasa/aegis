import { range_bearing_from_xy } from "utils/surf-nav/orienteering";
import { LGRS_CRS_INVALID } from "@bfeist/planetary-grid-reference";

const originScratch = new Float64Array(2);
const destinationScratch = new Float64Array(2);

/**
 * Planar grid bearing (degrees in [0, 360), clockwise from grid north) from `origin` to
 * `destination`, both projected into `crs` of `system`. Uses surf-nav's `range_bearing_from_xy`,
 * so south LPS results match the established surf-nav convention. Returns NaN if either point
 * cannot be projected, and 0 for a zero-length segment.
 */
export function getGridBearingInCrs(
  system: LgrsGridSystem,
  origin: AEGISPoint,
  destination: AEGISPoint,
  crs: LgrsCrsId
): number {
  if (
    !system.projectLatLon(origin.lat, origin.lng, crs, originScratch) ||
    !system.projectLatLon(destination.lat, destination.lng, crs, destinationScratch)
  ) {
    return NaN;
  }
  const { range, bearing } = range_bearing_from_xy(
    destinationScratch[0],
    destinationScratch[1],
    originScratch[0],
    originScratch[1]
  );
  if (range === 0) return 0;
  // surf-nav can round a bearing just west of grid north up to exactly 360.
  return bearing >= 360 ? bearing - 360 : bearing;
}

/**
 * Grid bearing in the origin's CRS of `system` (e.g. LPS or an LTM zone/hemisphere), the usual
 * UTM practice for segments that cross a zone seam. NaN if either point is invalid or
 * unprojectable.
 */
export function getLgrsGridBearing(
  system: LgrsGridSystem,
  origin: AEGISPoint,
  destination: AEGISPoint
): number {
  if (!origin || !destination) return NaN;
  const crs = system.classifyLatLon(origin.lat, origin.lng);
  if (
    crs === LGRS_CRS_INVALID ||
    system.classifyLatLon(destination.lat, destination.lng) === LGRS_CRS_INVALID
  ) {
    return NaN;
  }
  return getGridBearingInCrs(system, origin, destination, crs);
}

/**
 * Legacy south-LPS bearing bridge. Projects both points into south LPS (whatever their latitude)
 * with the LGRS projection and applies surf-nav's planar grid-north bearing. For the
 * whole-Moon origin-CRS bearing use `getLgrsGridBearing` from `utils/lgrs/bearing`.
 */
import { getGridBearingInCrs } from "utils/lgrs/bearing";
import { LGRS_CRS_LPS_SOUTH } from "utils/lgrs/crs";

/** South LPS grid bearing in [0, 360); 0 for a zero-length segment or an unprojectable point. */
export function getBearingFromLatLngPoints(origin: AEGISPoint, destination: AEGISPoint): number {
  if (!origin || !destination) return 0;
  const bearing = getGridBearingInCrs(origin, destination, LGRS_CRS_LPS_SOUTH);
  return Number.isNaN(bearing) ? 0 : bearing;
}

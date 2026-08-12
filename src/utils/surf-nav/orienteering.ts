/*
 * Surf-nav-compatible planar range and bearing helpers. AEGIS retains these for
 * LPS grid-north bearings after moving LGRS projection and coordinate display to utils/lgrs.
 *
 * The following functions should EXACTLY match the effect of coordinate functions from the surf_nav repo
 * They should ONLY be changed to match functionality in the surf_nav repo.
 * You can access these functions in the surf_nav repo at:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav
 *
 * and the file these functions are in is:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav/-/blob/main/surf_nav/nav_tools/orienteering.py?ref_type=heads
 *
 * The following functions are also EXPORT CONTROLLED! Authorization is required to export or reuse these items
 */

import { radiansToDegrees } from "@turf/helpers";

// Converts between range and bearing => range = 90 - bearing, bearing = 90 - range
function angle_bearing_conversion(alpha: number): number {
  let beta = 90 - alpha;
  if (beta < 0) {
    beta += 360;
  }
  return beta;
}

// Given a landmark and the x,y coordinates of the crew, calculate the range and bearing from the landmark to the crew
export function range_bearing_from_xy(
  x_dest: number,
  y_dest: number,
  x_source: number,
  y_source: number
): SN_RangeBearingPair {
  const range = Math.sqrt(Math.pow(x_dest - x_source, 2) + Math.pow(y_dest - y_source, 2));
  const angle = radiansToDegrees(Math.atan2(y_dest - y_source, x_dest - x_source));
  const bearing = angle_bearing_conversion(angle);

  return { range: range, bearing: bearing };
}

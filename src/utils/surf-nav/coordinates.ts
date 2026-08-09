import { degreesToRadians } from "@turf/helpers";
import {
  SURF_NAV_MOON_MEAN_RADIUS,
  SURF_NAV_MOON_K0,
  SURF_NAV_LPS_FALSE_EAST,
  SURF_NAV_LPS_FALSE_NORTH,
} from "../consts";

/*
 * Surf-nav compatibility coordinates retained for the LPS grid-north bearing path.
 * Displayed LGRS/ACC coordinates and dynamic-grid projection use the independently
 * oracle-verified lgrs port in utils/lgrs/southLps instead.
 *
 * The following function should EXACTLY match the effect of the coordinate function from the surf_nav repo
 * They should ONLY be changed to match functionality in the surf_nav repo.
 * You can access these functions in the surf_nav repo at:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav
 *
 * and the file these functions are in is:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav/-/blob/main/surf_nav/nav_tools/coordinates.py?ref_type=heads
 *
 * The following functions are also EXPORT CONTROLLED! Authorization is required to export or reuse these items
 */

export function latlong_to_lps(
  lat1: number,
  long1: number,
  k0: number = SURF_NAV_MOON_K0
): SN_LPSPair {
  const lat1Rads = degreesToRadians(lat1);
  const long1Rads = degreesToRadians(long1);
  const lat0Rads = degreesToRadians(-90);
  const long0Rads = degreesToRadians(0);
  const k =
    (2 * k0) /
    (1 +
      Math.sin(lat0Rads) * Math.sin(lat1Rads) +
      Math.cos(lat0Rads) * Math.cos(lat1Rads) * Math.cos(long1Rads - long0Rads));
  const e =
    SURF_NAV_MOON_MEAN_RADIUS * k * Math.cos(lat1Rads) * Math.sin(long1Rads - long0Rads) +
    SURF_NAV_LPS_FALSE_EAST;
  const n =
    SURF_NAV_MOON_MEAN_RADIUS *
      k *
      (Math.cos(lat0Rads) * Math.sin(lat1Rads) -
        Math.sin(lat0Rads) * Math.cos(lat1Rads) * Math.cos(long1Rads - long0Rads)) +
    SURF_NAV_LPS_FALSE_NORTH;

  return { n_lps: n, e_lps: e };
}

import { degreesToRadians, radiansToDegrees } from "@turf/helpers";
import {
  SURF_NAV_MOON_MEAN_RADIUS,
  SURF_NAV_MOON_K0,
  SURF_NAV_LPS_FALSE_EAST,
  SURF_NAV_LPS_FALSE_NORTH,
  SURF_NAV_LPS_E25K,
  SURF_NAV_LPS_N25K,
  SURF_NAV_LGRS_ACC,
} from "../consts";

/*
 * The following functions should EXACTLY match the effect of coordinate functions from the surf_nav repo
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
  const lat0Rads = degreesToRadians(-90); // Latitude of Projection Origin in Arc-Degrees
  const long0Rads = degreesToRadians(0); // Longitude of Projection Origin in Arc-Degrees
  const false_east = SURF_NAV_LPS_FALSE_EAST; // False Easting in Meters
  const false_north = SURF_NAV_LPS_FALSE_NORTH; // False North in Meters
  const a = SURF_NAV_MOON_MEAN_RADIUS; // Lunar Mean Radius in Meters
  const k =
    (2 * k0) /
    (1 +
      Math.sin(lat0Rads) * Math.sin(lat1Rads) +
      Math.cos(lat0Rads) * Math.cos(lat1Rads) * Math.cos(long1Rads - long0Rads));
  const e = a * k * (Math.cos(lat1Rads) * Math.sin(long1Rads - long0Rads)) + false_east;
  const n =
    a *
      k *
      (Math.cos(lat0Rads) * Math.sin(lat1Rads) -
        Math.sin(lat0Rads) * Math.cos(lat1Rads) * Math.cos(long1Rads - long0Rads)) +
    false_north;

  return { n_lps: n, e_lps: e };
}

export function lps_to_latlong(
  E_lps: number,
  N_lps: number,
  k0: number = SURF_NAV_MOON_K0
): SN_LatLongPair {
  const lat0Rads = degreesToRadians(-90); // Latitude of Projection Origin in Arc-Degrees
  const long0Rads = degreesToRadians(0); // Longitude of Projection Origin in Arc-Degrees
  const fe = SURF_NAV_LPS_FALSE_EAST; // False Easting in meters
  const fn = SURF_NAV_LPS_FALSE_NORTH; // False Northing in meters
  const x = E_lps - fe; // Rectangular coordinate with the false Easting removed
  const y = N_lps - fn; // Rectangular coordinate wiht the false Northing removed
  const a = SURF_NAV_MOON_MEAN_RADIUS; // Lunar Mean Radius in Meters
  const rho = Math.sqrt(x * x + y * y);
  const c = 2 * Math.atan2(rho, 2 * a * k0);
  if (E_lps === fe && N_lps === fn) {
    return { lat: -90, lng: 0 };
  } else {
    const lat = radiansToDegrees(
      Math.asin(Math.cos(c) * Math.sin(lat0Rads) + (y * Math.sin(c) * Math.cos(lat0Rads)) / rho)
    );
    const long = radiansToDegrees(long0Rads + Math.atan2(x, y));
    return { lat: lat, lng: long };
  }
}

export function lps_to_gridzone(E_lps: number, N_lps: number): string {
  const fe = SURF_NAV_LPS_FALSE_EAST;
  const fn = SURF_NAV_LPS_FALSE_NORTH;
  const e25k = SURF_NAV_LPS_E25K;
  const n25k = SURF_NAV_LPS_N25K;
  let e_index;
  if (E_lps < fe) {
    if (((Math.abs(E_lps - fe) % 25000) + 25000) % 25000 === 0) {
      e_index = 24 - Math.floor(Math.abs(E_lps - fe) / 25000);
    } else {
      e_index = 24 - Math.floor(Math.abs(E_lps - fe) / 25000) - 1;
    }
  } else {
    e_index = Math.floor((E_lps - fe) / 25000);
  }
  const n_index = Math.floor((N_lps - fn) / 25000) + 13;
  return String(e25k[e_index]) + String(n25k[n_index]);
}

export function lps_to_polar_zone(E_lps: number): string {
  if (E_lps < SURF_NAV_LPS_FALSE_EAST) {
    return "A";
  } else if (E_lps >= SURF_NAV_LPS_FALSE_EAST) {
    return "B";
  }
  return "";
}

export function lps_to_lgrs(E_lps: number, N_lps: number): SN_LGRSPair {
  const fe = SURF_NAV_LPS_FALSE_EAST;
  const fn = SURF_NAV_LPS_FALSE_NORTH;
  const x = Math.round(E_lps) - fe;
  const y = Math.round(N_lps) - fn;
  const e_lgrs = String(((x % 25000) + 25000) % 25000).padStart(5, "0"); // Modified to match modulo behavior in python
  const n_lgrs = String(((y % 25000) + 25000) % 25000).padStart(5, "0"); // Modified to match modulo behavior in python
  return { n_lgrs: n_lgrs, e_lgrs: e_lgrs };
}

export function lgrs_to_lps(
  E_lgrs: string,
  N_lgrs: string,
  gridzone: string,
  polarzone: string
): SN_LPSPair {
  const e25k = SURF_NAV_LPS_E25K;
  const n25k = SURF_NAV_LPS_N25K;
  const fe = SURF_NAV_LPS_FALSE_EAST;
  const fn = SURF_NAV_LPS_FALSE_NORTH;
  const e_index = e25k.indexOf(gridzone[0]);
  const n_index = n25k.indexOf(gridzone[1]);

  let e_lps;
  if (polarzone === "A") {
    e_lps = fe - (24 - e_index) * 25000 + parseInt(E_lgrs, 10);
  } else if (polarzone === "B") {
    e_lps = fe + e_index * 25000 + parseInt(E_lgrs, 10);
  }

  const n_lps = fn + (n_index - 13) * 25000 + parseInt(N_lgrs, 10);

  return { n_lps: n_lps, e_lps: e_lps };
}

export function lgrs_to_acc(E_lgrs: string, N_lgrs: string): SN_ACCPair {
  const acc = SURF_NAV_LGRS_ACC;
  const east_index = parseInt(E_lgrs.slice(0, 2), 10);
  const north_index = parseInt(N_lgrs.slice(0, 2), 10);
  const east_grid = acc[east_index];
  const north_grid = acc[north_index];
  const e_acc = east_grid + E_lgrs.slice(2, 5);
  const n_acc = north_grid + N_lgrs.slice(2, 5);
  return { n_acc: n_acc, e_acc: e_acc };
}

export function acc_to_lgrs(E_acc: string, N_acc: string): SN_LGRSPair {
  const acc = SURF_NAV_LGRS_ACC;
  const east_index = acc.indexOf(E_acc.slice(0, 1));
  const north_index = acc.indexOf(N_acc.slice(0, 1));

  const E_lgrs = (String(east_index) + E_acc.slice(1)).padStart(5, "0");
  const N_lgrs = (String(north_index) + N_acc.slice(1)).padStart(5, "0");

  return { n_lgrs: N_lgrs, e_lgrs: E_lgrs };
}

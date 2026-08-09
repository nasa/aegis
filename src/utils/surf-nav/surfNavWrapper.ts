/**
 * Surf-nav bearing bridge. LGRS coordinate display and dynamic-grid projection
 * live in utils/lgrs/southLps; this wrapper preserves only LPS grid-north bearings.
 */
import { latlong_to_lps } from "./coordinates";
import { range_bearing_from_xy } from "./orienteering";

export function getBearingFromLatLngPoints(origin: AEGISPoint, destination: AEGISPoint): number {
  const oLpsPair: SN_LPSPair = latlong_to_lps(origin.lat, origin.lng);
  const dLpsPair: SN_LPSPair = latlong_to_lps(destination.lat, destination.lng);
  const rangeBearing: SN_RangeBearingPair = range_bearing_from_xy(
    dLpsPair.e_lps,
    dLpsPair.n_lps,
    oLpsPair.e_lps,
    oLpsPair.n_lps
  );

  return rangeBearing.bearing;
}

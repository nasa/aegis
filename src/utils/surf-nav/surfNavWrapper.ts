/**
 * Surf-nav bearing bridge. LGRS owns the LPS projection; surf-nav supplies
 * only the planar grid-north bearing calculation.
 */
import { latlong_to_lps } from "utils/lgrs/southLps";
import { range_bearing_from_xy } from "./orienteering";

export function getBearingFromLatLngPoints(origin: AEGISPoint, destination: AEGISPoint): number {
  const oLpsPair = latlong_to_lps(origin.lat, origin.lng);
  const dLpsPair = latlong_to_lps(destination.lat, destination.lng);
  if (!oLpsPair || !dLpsPair) return 0;

  const rangeBearing: SN_RangeBearingPair = range_bearing_from_xy(
    dLpsPair.e_lps,
    dLpsPair.n_lps,
    oLpsPair.e_lps,
    oLpsPair.n_lps
  );

  return rangeBearing.range === 0 ? 0 : rangeBearing.bearing;
}

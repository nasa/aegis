import { latlong_to_lps, lgrs_to_acc, lps_to_lgrs } from "./coordinates";
import { range_bearing_from_xy } from "./orienteering";

export function getLGRSCoordsFromLatLng(lat: number, lng: number): string {
  const { n_lps, e_lps } = latlong_to_lps(lat, lng);
  const { n_lgrs, e_lgrs } = lps_to_lgrs(e_lps, n_lps);
  const { n_acc, e_acc } = lgrs_to_acc(e_lgrs, n_lgrs);

  return `${e_acc.slice(0, 3)} ${n_acc.slice(0, 3)}`;
}

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

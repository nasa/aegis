import { latlong_to_lps, lgrs_to_acc, lps_to_lgrs } from "./coordinates";

export function getLGRSCoordsFromLatLng(lat: number, lng: number): string {
  const { n_lps, e_lps } = latlong_to_lps(lat, lng);
  const { n_lgrs, e_lgrs } = lps_to_lgrs(e_lps, n_lps);
  const { n_acc, e_acc } = lgrs_to_acc(e_lgrs, n_lgrs);

  return `${e_acc.slice(0, 3)} ${n_acc.slice(0, 3)}`;
}

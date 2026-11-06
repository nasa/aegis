import { formatLatLonAsLgrs } from "./format";

/** Length of the condensed ACC part (both axes) at `precision`. */
function getCondensedLength(precision: LgrsPrecision): number {
  switch (precision) {
    case 1:
      return 8;
    case 10:
      return 6;
    case 100:
      return 4;
    case 1000:
      return 2;
    default:
      return 0;
  }
}

/**
 * Display string for a lat/lon in its own (default M2025) LGRS CRS, using point semantics (the
 * point's own latitude picks the LTM band). `"condensed"` gives `B95 D44`; `"full"` prefixes the
 * zone/band and 25 km area letters, e.g. `AZM B95 D44` or `23NFF -00 -00`. At 25 km both styles
 * are the prefix alone. Returns null for an invalid point.
 */
export function formatMoonPoint(
  lat: number,
  lon: number,
  precision: LgrsPrecision,
  style: LgrsDisplayStyle
): string | null {
  const acc = formatLatLonAsLgrs(lat, lon, precision, "acc");
  if (acc === null) return null;

  const condensedLength = getCondensedLength(precision);
  if (condensedLength === 0) return acc;
  const prefixLength = acc.length - condensedLength;
  const northingStart = prefixLength + condensedLength / 2;
  const axes = `${acc.slice(prefixLength, northingStart)} ${acc.slice(northingStart)}`;
  return style === "full" ? `${acc.slice(0, prefixLength)} ${axes}` : axes;
}

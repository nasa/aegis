/** Body-neutral helpers shared by every grid system. */

/** The invalid CRS id in every grid system. */
export const LGRS_CRS_INVALID: LgrsCrsId = -1;

/** Conform a longitude to [-180, 180) the way `lgrs` does (values already in range are kept). */
export function conformLongitude(lon: number): number {
  if (lon >= -180 && lon < 180) return lon;
  let conformed = lon % 360;
  if (conformed < 0) conformed += 360;
  if (conformed >= 180) conformed -= 360;
  return conformed;
}

/** Values `origin + k·step` inside the envelope's longitudes (unwrapped to the envelope). */
export function getEnvelopeLongitudes(
  envelope: LgrsViewEnvelope,
  step: number,
  origin: number
): number[] {
  const values: number[] = [];
  if (envelope.fullLon) {
    for (let value = origin; value < origin + 360; value += step) values.push(value);
    return values;
  }
  const first = Math.ceil((envelope.minLon - origin) / step);
  const last = Math.floor((envelope.maxLon - origin) / step);
  for (let k = first; k <= last; k++) values.push(origin + k * step);
  return values;
}

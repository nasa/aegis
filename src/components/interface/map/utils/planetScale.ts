/**
 * Planet scale detection.
 *
 * `planetRadius` in mission docs may be stored as the spherical mean
 * (Earth 6371000), WGS84 equatorial (6378137), or other near-Earth values
 * — we can't rely on exact equality with one canonical constant. Anything
 * larger than a clear midpoint between Earth (~6.37M m) and Moon (~1.74M m)
 * is treated as Earth-scale for view fitting decisions.
 */

const EARTH_MOON_THRESHOLD_M = 4_000_000;

export function isEarthScale(planetRadius: number | null | undefined): boolean {
  return typeof planetRadius === "number" && planetRadius > EARTH_MOON_THRESHOLD_M;
}

/** Max zoom level appropriate for a planet's tile pyramid. */
export function maxZoomForPlanet(planetRadius: number | null | undefined): number {
  return isEarthScale(planetRadius) ? 19 : 17;
}

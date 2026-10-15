import { Body, GeoMoon, HelioVector, KM_PER_AU, RotationAxis } from "astronomy-engine";
import type { Vector } from "astronomy-engine";

const DEG = Math.PI / 180;
const METERS_PER_AU = KM_PER_AU * 1000;
/** Angular step (radians) used to probe the map direction of an azimuth. */
const MAP_PROBE_ANGLE = 1e-5;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const toMeters = (v: Vector): Vec3 => [
  v.x * METERS_PER_AU,
  v.y * METERS_PER_AU,
  v.z * METERS_PER_AU,
];
const normalizeDegrees = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Local east/north/up basis of a lunar surface point, in the J2000 equatorial frame,
 * using the IAU Moon rotation model (prime meridian = mean Earth direction).
 */
function getLunarSurfaceFrame(point: AEGISPoint, heightMeters: number, radius: number, date: Date) {
  const axis = RotationAxis(Body.Moon, date);
  const pole: Vec3 = [axis.north.x, axis.north.y, axis.north.z];
  const ra = axis.ra * 15 * DEG;
  const spin = axis.spin * DEG;

  // Ascending node of the lunar equator on the J2000 equator, then rotate by W to the prime meridian.
  const node: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const xAxis = add(scale(node, Math.cos(spin)), scale(cross(pole, node), Math.sin(spin)));
  const yAxis = cross(pole, xAxis);

  const lat = point.lat * DEG;
  const lng = point.lng * DEG;
  const up = add(
    add(scale(xAxis, Math.cos(lat) * Math.cos(lng)), scale(yAxis, Math.cos(lat) * Math.sin(lng))),
    scale(pole, Math.sin(lat))
  );
  const east = add(scale(xAxis, -Math.sin(lng)), scale(yAxis, Math.cos(lng)));
  const north = cross(up, east);
  return { site: scale(up, radius + heightMeters), up, east, north };
}

/**
 * Sun and Earth directions seen from a point on the lunar surface.
 * Azimuth is degrees clockwise from true (selenographic) north; elevation is the angle
 * above the smooth local horizon, ignoring terrain.
 * @param point surface location (selenographic lat/lng in degrees)
 * @param heightMeters height above the reference sphere (e.g. DEM elevation)
 * @param radius reference sphere radius in meters
 * @param epochMs UTC time as a unix epoch in milliseconds
 */
export function getLunarSunEarthPositions(
  point: AEGISPoint,
  heightMeters: number,
  radius: number,
  epochMs: number
): LunarSunEarthPositions {
  const date = new Date(epochMs);
  const { site, up, east, north } = getLunarSurfaceFrame(point, heightMeters, radius, date);

  const toLocal = (bodyFromMoonCenter: Vec3): LunarSkyPosition => {
    const v = sub(bodyFromMoonCenter, site);
    const dist = Math.hypot(v[0], v[1], v[2]);
    return {
      azimuth: normalizeDegrees(Math.atan2(dot(v, east), dot(v, north)) / DEG),
      elevation: Math.asin(dot(v, up) / dist) / DEG,
    };
  };

  return {
    sun: toLocal(scale(toMeters(HelioVector(Body.Moon, date)), -1)),
    earth: toLocal(scale(toMeters(GeoMoon(date)), -1)),
  };
}

/**
 * Convert a true-north azimuth at a point into a screen-up (map grid) azimuth, by
 * projecting a tiny step along the azimuth. Needed near the pole, where true north and
 * map up diverge by roughly the point's longitude.
 * @param project lat/lng → projected [x, y] with y increasing up the map
 */
export function getMapAzimuthFromTrueAzimuth(
  point: AEGISPoint,
  trueAzimuth: number,
  project: (p: AEGISPoint) => number[]
): number {
  const lat1 = point.lat * DEG;
  const lng1 = point.lng * DEG;
  const brng = trueAzimuth * DEG;
  const d = MAP_PROBE_ANGLE;
  const up: Vec3 = [
    Math.cos(lat1) * Math.cos(lng1),
    Math.cos(lat1) * Math.sin(lng1),
    Math.sin(lat1),
  ];
  const east: Vec3 = [-Math.sin(lng1), Math.cos(lng1), 0];
  const north = cross(up, east);
  const direction = add(scale(north, Math.cos(brng)), scale(east, Math.sin(brng)));
  // A tangent step remains stable at the poles, where longitude formulas lose precision.
  const target = add(scale(up, Math.cos(d)), scale(direction, Math.sin(d)));
  const lat2 = Math.atan2(target[2], Math.hypot(target[0], target[1]));
  const lng2 = Math.atan2(target[1], target[0]);

  const [x1, y1] = project(point);
  const [x2, y2] = project({ lat: lat2 / DEG, lng: lng2 / DEG });
  if (![x1, y1, x2, y2].every(Number.isFinite) || (x1 === x2 && y1 === y2)) return trueAzimuth;
  return normalizeDegrees(Math.atan2(x2 - x1, y2 - y1) / DEG);
}

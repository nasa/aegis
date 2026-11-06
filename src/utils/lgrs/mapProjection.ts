import proj4 from "proj4";

/**
 * Map CRS ↔ lat/lon projectors, independent of any grid system. proj4 converters are built once
 * per projection and cached. Spherical polar stereographic, Mercator and `+approx` Transverse
 * Mercator maps use closed-form ports of proj4's own formulas, checked bit-for-bit against proj4
 * when the projector is built, so lat/lon semantics are exactly those of
 * `proj4(projCode, "EPSG:4326")`.
 */

// proj4 constants (lib/constants/values.js).
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const HALF_PI = Math.PI / 2;
const FORTPI = Math.PI / 4;
const TWO_PI = Math.PI * 2;
const SPI = 3.14159265359;
const EPSLN = 1.0e-10;

function adjustLon(x: number, skipAdjust: boolean): number {
  if (skipAdjust) return x;
  return Math.abs(x) <= SPI ? x : x - (x < 0 ? -1 : 1) * TWO_PI;
}

const STERE_POLAR: LgrsFastPathFunctions = {
  forward(p, lat, lon, out) {
    const sinlat = Math.sin(lat);
    const coslat = Math.cos(lat);
    const dlon = adjustLon(lon - p.long0, p.over);
    if (Math.abs(Math.abs(lon - p.long0) - Math.PI) <= EPSLN && Math.abs(lat + p.lat0) <= EPSLN) {
      return false;
    }
    const a = (2 * p.k0) / (1 + p.sinlat0 * sinlat + p.coslat0 * coslat * Math.cos(dlon));
    out[0] = p.a * a * coslat * Math.sin(dlon) + p.x0;
    out[1] = p.a * a * (p.coslat0 * sinlat - p.sinlat0 * coslat * Math.cos(dlon)) + p.y0;
    return true;
  },
  inverse(p, x, y, out) {
    x -= p.x0;
    y -= p.y0;
    const rh = Math.sqrt(x * x + y * y);
    const c = 2 * Math.atan(rh / (2 * p.a * p.k0));
    if (rh <= EPSLN) {
      out[0] = p.lat0;
      out[1] = p.long0;
      return true;
    }
    out[0] = Math.asin(Math.cos(c) * p.sinlat0 + (y * Math.sin(c) * p.coslat0) / rh);
    out[1] = adjustLon(p.long0 + Math.atan2(x, p.lat0 > 0 ? -1 * y : y), p.over);
    return true;
  },
};

const MERC: LgrsFastPathFunctions = {
  forward(p, lat, lon, out) {
    if (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN) return false;
    out[0] = p.x0 + p.a * p.k0 * adjustLon(lon - p.long0, p.over);
    out[1] = p.y0 + p.a * p.k0 * Math.log(Math.tan(FORTPI + 0.5 * lat));
    return true;
  },
  inverse(p, x, y, out) {
    x -= p.x0;
    y -= p.y0;
    out[0] = HALF_PI - 2 * Math.atan(Math.exp(-y / (p.a * p.k0)));
    out[1] = adjustLon(p.long0 + x / (p.a * p.k0), p.over);
    return true;
  },
};

const TMERC_SPHERE: LgrsFastPathFunctions = {
  forward(p, lat, lon, out) {
    const deltaLon = adjustLon(lon - p.long0, p.over);
    const cosPhi = Math.cos(lat);
    let b = cosPhi * Math.sin(deltaLon);
    if (Math.abs(Math.abs(b) - 1) < EPSLN) return false;
    const x = 0.5 * p.a * p.k0 * Math.log((1 + b) / (1 - b)) + p.x0;
    let y = (cosPhi * Math.cos(deltaLon)) / Math.sqrt(1 - Math.pow(b, 2));
    b = Math.abs(y);
    if (b >= 1) {
      if (b - 1 > EPSLN) return false;
      y = 0;
    } else {
      y = Math.acos(y);
    }
    if (lat < 0) y = -y;
    out[0] = x;
    out[1] = p.a * p.k0 * (y - p.lat0) + p.y0;
    return true;
  },
  inverse(p, x, y, out) {
    x = (x - p.x0) * (1 / p.a);
    y = (y - p.y0) * (1 / p.a);
    const f = Math.exp(x / p.k0);
    const g = 0.5 * (f - 1 / f);
    const h = Math.cos(p.lat0 + y / p.k0);
    let lat = Math.asin(Math.sqrt((1 - Math.pow(h, 2)) / (1 + Math.pow(g, 2))));
    if (y < 0) lat = -lat;
    out[0] = lat;
    out[1] = g === 0 && h === 0 ? 0 : adjustLon(Math.atan2(g, h) + p.long0, p.over);
    return true;
  },
};

const FAST_PATHS: Record<LgrsMapFastPath, LgrsFastPathFunctions> = {
  "stere-polar": STERE_POLAR,
  merc: MERC,
  tmerc: TMERC_SPHERE,
};

function selectFastPath(p: LgrsProj4Params | null): LgrsMapFastPath | null {
  if (!p || !p.sphere || p.from_greenwich || (p.to_meter !== undefined && p.to_meter !== 1)) {
    return null;
  }
  if (![p.a, p.k0, p.x0, p.y0, p.long0].every(Number.isFinite)) return null;
  if (p.projName === "merc") return "merc";
  if (!Number.isFinite(p.lat0)) return null;
  if (p.projName === "stere" && Math.abs(p.coslat0) < EPSLN) return "stere-polar";
  if (p.projName === "tmerc" && p.approx && !p.es) return "tmerc";
  return null;
}

const PROBE_LATITUDES = [-89.5, -85, -80, -60, -30, -1, 0, 0.5, 30, 60, 80, 85, 89.5];
const PROBE_LONGITUDES = [-179, -90, -17.47, -4, 0, 3, 45, 120, 179];

/** True when the closed form matches proj4 bit-for-bit on every probe proj4 can convert. */
function verifyFastPath(
  fast: LgrsFastPathFunctions,
  p: LgrsProj4Params,
  converter: proj4.Converter
): boolean {
  const out = new Float64Array(2);
  for (const lat of PROBE_LATITUDES) {
    for (const lon of PROBE_LONGITUDES) {
      let map: number[];
      try {
        map = converter.inverse([lon, lat]);
      } catch {
        continue;
      }
      if (!Number.isFinite(map[0]) || !Number.isFinite(map[1])) continue;
      if (!fast.forward(p, lat * D2R, lon * D2R, out)) return false;
      if (!Object.is(out[0], map[0]) || !Object.is(out[1], map[1])) return false;

      const geographic = converter.forward([map[0], map[1]]);
      if (!fast.inverse(p, map[0], map[1], out)) return false;
      if (!Object.is(out[0] * R2D, geographic[1]) || !Object.is(out[1] * R2D, geographic[0])) {
        return false;
      }
    }
  }
  return true;
}

function getWorldWidth(
  params: LgrsProj4Params | null,
  converter: proj4.Converter | null
): number | null {
  if (!converter || (params?.projName !== "merc" && params?.projName !== "eqc")) return null;
  const longitude = params.long0 * R2D;
  const west = converter.inverse([longitude - 90, 0]);
  const east = converter.inverse([longitude + 90, 0]);
  const width = 2 * (east[0] - west[0]);
  return Number.isFinite(width) && width > 0 ? width : null;
}

class MapProjector implements LgrsMapProjector {
  readonly projection: LgrsMapProjection;
  readonly params: LgrsProj4Params | null;
  readonly worldWidth: number | null;
  readonly fastPath: LgrsMapFastPath | null;
  readonly isUsable: boolean;
  private readonly converter: proj4.Converter | null;
  private readonly fast: LgrsFastPathFunctions | null;

  constructor(projection: LgrsMapProjection) {
    this.projection = projection;
    const definition = projection.proj4Def || projection.projCode;
    let converter: proj4.Converter | null = null;
    let params: LgrsProj4Params | null = null;
    try {
      converter = proj4(definition, "EPSG:4326");
      params = proj4.Proj(definition) as unknown as LgrsProj4Params;
    } catch {
      converter = null;
    }
    this.converter = converter;
    this.params = params;
    this.isUsable = converter !== null;
    this.worldWidth = getWorldWidth(params, converter);

    let fastPath = converter ? selectFastPath(params) : null;
    if (fastPath && !verifyFastPath(FAST_PATHS[fastPath], params, converter)) fastPath = null;
    this.fastPath = fastPath;
    this.fast = fastPath ? FAST_PATHS[fastPath] : null;
  }

  mapToLatLon(x: number, y: number, out: Float64Array): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (this.fast) {
      if (!this.fast.inverse(this.params, x, y, out)) return false;
      out[0] *= R2D;
      out[1] *= R2D;
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (!this.converter) return false;
    let result: number[];
    try {
      result = this.converter.forward([x, y]);
    } catch {
      return false;
    }
    out[0] = result[1];
    out[1] = result[0];
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  }

  latLonToMap(lat: number, lon: number, out: Float64Array): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (this.fast) {
      if (!this.fast.forward(this.params, lat * D2R, lon * D2R, out)) return false;
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (!this.converter) return false;
    let result: number[];
    try {
      result = this.converter.inverse([lon, lat]);
    } catch {
      return false;
    }
    out[0] = result[0];
    out[1] = result[1];
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  }
}

const projectorCache = new Map<string, MapProjector>();

/** The map CRS the app uses for a mission (mirrors `MapProvider` / `useCoordConverters`). */
export function getLgrsMapProjection(
  mission: Pick<Mission, "id" | "projIsCustom" | "projEpsg" | "projProj4String">
): LgrsMapProjection {
  if (mission.projIsCustom && mission.projProj4String && mission.projEpsg) {
    return {
      projCode:
        mission.projEpsg === "EPSG:3857" ? `AEGIS:${mission.id ?? "custom"}` : mission.projEpsg,
      proj4Def: mission.projProj4String,
    };
  }
  return { projCode: "EPSG:3857", proj4Def: null };
}

/** Cache key of a map projection. */
export function getMapProjectionKey(projection: LgrsMapProjection): string {
  return `${projection.projCode}\n${projection.proj4Def ?? ""}`;
}

/** Whether proj4 could build the projector; an unusable one fails every conversion. */
export function isUsableProjector(projector: LgrsMapProjector): boolean {
  return projector instanceof MapProjector && projector.isUsable;
}

/**
 * Cached projector for a map projection. A projection proj4 cannot build is not cached, and its
 * projector returns false from every conversion.
 */
export function getLgrsMapProjector(projection: LgrsMapProjection): LgrsMapProjector {
  const key = getMapProjectionKey(projection);
  const cached = projectorCache.get(key);
  if (cached) return cached;
  const projector = new MapProjector(projection);
  if (projector.isUsable) projectorCache.set(key, projector);
  return projector;
}

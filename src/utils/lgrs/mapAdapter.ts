import proj4 from "proj4";

import {
  LGRS_MOON_RADIUS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
  LPS_K0,
  LTM_FALSE_EASTING,
  LTM_FALSE_NORTHING_NORTH,
  LTM_FALSE_NORTHING_SOUTH,
  LTM_K0,
  LTM_ZONE_COUNT,
} from "./constants";
import {
  getLtmCentralMeridian,
  getLtmCrsId,
  isValidCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "./crs";
import { formatLatLonAsLgrs } from "./format";
import { projectLatLon, unprojectToLatLon } from "./projection";

/**
 * Map CRS ↔ lat/lon ↔ LGRS adapters. proj4 converters are built once per projection and cached.
 * Spherical polar stereographic, Mercator and `+approx` Transverse Mercator maps use closed-form
 * ports of proj4's own formulas, checked bit-for-bit against proj4 when the adapter is built, so
 * lat/lon semantics are exactly those of `proj4(projCode, "EPSG:4326")`.
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

type FastPathFunctions = {
  /** lat/lon (radians) → map; false on failure. */
  forward(p: LgrsProj4Params, lat: number, lon: number, out: Float64Array): boolean;
  /** map → lat/lon (radians) in `out` as `[lat, lon]`; false on failure. */
  inverse(p: LgrsProj4Params, x: number, y: number, out: Float64Array): boolean;
};

const STERE_POLAR: FastPathFunctions = {
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

const MERC: FastPathFunctions = {
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

const TMERC_SPHERE: FastPathFunctions = {
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

const FAST_PATHS: Record<LgrsMapFastPath, FastPathFunctions> = {
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
  fast: FastPathFunctions,
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

function createAffines(
  p: LgrsProj4Params | null,
  fastPath: LgrsMapFastPath | null
): LgrsMapAffine[] {
  if (!p || p.a !== LGRS_MOON_RADIUS) return [];
  if (fastPath === "stere-polar" && p.long0 === 0) {
    const scale = LPS_K0 / p.k0;
    return [
      {
        crs: p.lat0 > 0 ? LGRS_CRS_LPS_NORTH : LGRS_CRS_LPS_SOUTH,
        scale,
        offsetE: LPS_FALSE_EASTING - scale * p.x0,
        offsetN: LPS_FALSE_NORTHING - scale * p.y0,
      },
    ];
  }
  if (fastPath === "tmerc" && p.lat0 === 0) {
    const centralMeridian = p.long0 * R2D;
    for (let zone = 1; zone <= LTM_ZONE_COUNT; zone++) {
      if (Math.abs(getLtmCentralMeridian(zone) - centralMeridian) > 1e-9) continue;
      const scale = LTM_K0 / p.k0;
      const offsetE = LTM_FALSE_EASTING - scale * p.x0;
      return [
        {
          crs: getLtmCrsId(zone, "N"),
          scale,
          offsetE,
          offsetN: LTM_FALSE_NORTHING_NORTH - scale * p.y0,
        },
        {
          crs: getLtmCrsId(zone, "S"),
          scale,
          offsetE,
          offsetN: LTM_FALSE_NORTHING_SOUTH - scale * p.y0,
        },
      ];
    }
  }
  return [];
}

class MapAdapter implements LgrsMapAdapter {
  readonly projection: LgrsMapProjection;
  readonly fastPath: LgrsMapFastPath | null;
  readonly isUsable: boolean;
  private readonly converter: proj4.Converter | null;
  private readonly params: LgrsProj4Params | null;
  private readonly fast: FastPathFunctions | null;
  private readonly affines: LgrsMapAffine[];
  private readonly scratch = new Float64Array(2);

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

    let fastPath = converter ? selectFastPath(params) : null;
    if (fastPath && !verifyFastPath(FAST_PATHS[fastPath], params, converter)) fastPath = null;
    this.fastPath = fastPath;
    this.fast = fastPath ? FAST_PATHS[fastPath] : null;
    this.affines = createAffines(params, fastPath);
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

  getAffine(crs: LgrsCrsId): LgrsMapAffine | null {
    for (const affine of this.affines) if (affine.crs === crs) return affine;
    return null;
  }

  mapToLgrs(x: number, y: number, crs: LgrsCrsId, out: Float64Array): boolean {
    if (!isValidCrs(crs)) return false;
    const affine = this.getAffine(crs);
    if (affine) {
      out[0] = x * affine.scale + affine.offsetE;
      out[1] = y * affine.scale + affine.offsetN;
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (!this.mapToLatLon(x, y, this.scratch)) return false;
    return projectLatLon(this.scratch[0], this.scratch[1], crs, out);
  }

  lgrsToMap(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean {
    if (!isValidCrs(crs)) return false;
    const affine = this.getAffine(crs);
    if (affine) {
      out[0] = (e - affine.offsetE) / affine.scale;
      out[1] = (n - affine.offsetN) / affine.scale;
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (!unprojectToLatLon(e, n, crs, this.scratch)) return false;
    return this.latLonToMap(this.scratch[0], this.scratch[1], out);
  }
}

const adapterCache = new Map<string, MapAdapter>();

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

/**
 * Cached adapter for a map projection. A projection proj4 cannot build is not cached, and its
 * adapter returns false from every conversion.
 */
export function getLgrsMapAdapter(projection: LgrsMapProjection): LgrsMapAdapter {
  const key = `${projection.projCode}\n${projection.proj4Def ?? ""}`;
  const cached = adapterCache.get(key);
  if (cached) return cached;
  const adapter = new MapAdapter(projection);
  if (adapter.isUsable) adapterCache.set(key, adapter);
  return adapter;
}

const displayScratch = new Float64Array(2);

/** LGRS/ACC string for a map coordinate, via its lat/lon (same result as for a stored point). */
export function formatLgrsAtMapCoordinate(
  adapter: LgrsMapAdapter,
  x: number,
  y: number,
  precision: LgrsPrecision,
  kind: LgrsStringKind
): string | null {
  if (!adapter.mapToLatLon(x, y, displayScratch)) return null;
  return formatLatLonAsLgrs(displayScratch[0], displayScratch[1], precision, kind);
}

import { getLgrsMapProjector, getMapProjectionKey, isUsableProjector } from "./mapProjection";

/**
 * Map projection × grid system bindings. Grid E/N go through the system's affine relation to the
 * map CRS when there is one (so lines stay straight two-vertex segments), otherwise through the
 * projector's lat/lon and the system's projection.
 */

class GridBinding implements LgrsGridBinding {
  readonly projection: LgrsMapProjection;
  readonly params: LgrsProj4Params | null;
  readonly worldWidth: number | null;
  readonly fastPath: LgrsMapFastPath | null;
  readonly system: LgrsGridSystem;
  private readonly projector: LgrsMapProjector;
  /** Affine relation per CRS id (null when there is none). */
  private readonly affines: (LgrsMapAffine | null)[] = [];
  private readonly scratch = new Float64Array(2);

  constructor(projector: LgrsMapProjector, system: LgrsGridSystem) {
    this.projector = projector;
    this.system = system;
    this.projection = projector.projection;
    this.params = projector.params;
    this.worldWidth = projector.worldWidth;
    this.fastPath = projector.fastPath;
    for (let crs = 0; system.isValidCrs(crs); crs++) {
      this.affines.push(system.getAffine(projector.params, projector.fastPath, crs));
    }
  }

  mapToLatLon(x: number, y: number, out: Float64Array): boolean {
    return this.projector.mapToLatLon(x, y, out);
  }

  latLonToMap(lat: number, lon: number, out: Float64Array): boolean {
    return this.projector.latLonToMap(lat, lon, out);
  }

  getAffine(crs: LgrsCrsId): LgrsMapAffine | null {
    return this.system.isValidCrs(crs) ? (this.affines[crs] ?? null) : null;
  }

  mapToGrid(x: number, y: number, crs: LgrsCrsId, out: Float64Array): boolean {
    if (!this.system.isValidCrs(crs)) return false;
    const affine = this.affines[crs];
    if (affine) {
      out[0] = x * affine.scale + affine.offsetE;
      out[1] = y * affine.scale + affine.offsetN;
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (!this.projector.mapToLatLon(x, y, this.scratch)) return false;
    return this.system.projectLatLon(this.scratch[0], this.scratch[1], crs, out);
  }

  gridToMap(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean {
    if (!this.system.isValidCrs(crs)) return false;
    const affine = this.affines[crs];
    if (affine) {
      out[0] = (e - affine.offsetE) / affine.scale;
      out[1] = (n - affine.offsetN) / affine.scale;
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (!this.system.unprojectToLatLon(e, n, crs, this.scratch)) return false;
    return this.projector.latLonToMap(this.scratch[0], this.scratch[1], out);
  }
}

const bindingCache = new Map<string, GridBinding>();

/** Cache key of a binding: the map projection key plus the system key. */
export function getGridBindingKey(projection: LgrsMapProjection, system: LgrsGridSystem): string {
  return `${getMapProjectionKey(projection)}\n${system.key}`;
}

/**
 * Cached binding of a map projection to a grid system. A projection proj4 cannot build is not
 * cached, and its binding returns false from every conversion.
 */
export function getLgrsGridBinding(
  projection: LgrsMapProjection,
  system: LgrsGridSystem
): LgrsGridBinding {
  const key = getGridBindingKey(projection, system);
  const cached = bindingCache.get(key);
  if (cached) return cached;
  const projector = getLgrsMapProjector(projection);
  const binding = new GridBinding(projector, system);
  if (isUsableProjector(projector)) bindingCache.set(key, binding);
  return binding;
}

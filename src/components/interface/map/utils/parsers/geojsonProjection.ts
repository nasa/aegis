/**
 * geojsonProjection — resolves the *source* coordinate space of a GeoJSON document
 * without requiring an import-time setting, a data migration, or per-layer stored
 * metadata (see `docs/MS3_20260812_VECTOR_IMPORT_AUDIT.md`, "Legacy GeoJSON rendering
 * compatibility").
 *
 * AEGIS's vector sublayers are a mix of:
 *   - Legacy/pipeline GeoJSON already in geographic lon/lat (the overwhelming majority),
 *     with or without an explicit `crs` member (`EPSG:4326`, `OGC:CRS84`, `ESRI:104903`).
 *   - A small number of legacy files that carry raw **projected meter** coordinates in
 *     the mission's own Moon 2000 South Pole Stereographic space (`ESRI:103878`) —
 *     these must NOT be treated as longitude/latitude.
 *
 * Resolution order (mirrors the audit's compatibility rule):
 *   1. A recognized embedded `crs` member wins outright.
 *   2. Otherwise, classify every coordinate: if all are degree-bounded
 *      (-180..180 / -90..90), treat the document as geographic (EPSG:4326).
 *   3. Otherwise, treat it as native projected meters in the mission's own
 *      projection (no transform needed — it's already in map units).
 *
 * A `crs` member naming an unsupported projected CRS (or a malformed document) is a
 * hard failure — never silently reinterpreted as longitude/latitude.
 */

// ---------------------------------------------------------------------------
// crs member normalization
// ---------------------------------------------------------------------------

export type ResolvedCrsKind = "geographic" | "projected";

/**
 * Classify a GeoJSON `crs` member's name string. Returns null when the name doesn't
 * match any supported marker (caller should treat this as a hard failure, not a
 * silent geographic fallback).
 */
export function classifyCrsName(name: string | null | undefined): ResolvedCrsKind | null {
  if (!name) return null;
  const upper = name.trim().toUpperCase();
  const authorityMatch = upper.match(/^(?:URN:OGC:DEF:CRS:)?(EPSG|ESRI):(?:(?:[^:]*):)?(\d+)$/);
  if (authorityMatch) {
    const [, authority, code] = authorityMatch;
    if (authority === "EPSG" && code === "4326") return "geographic";
    if (authority === "ESRI" && code === "104903") return "geographic";
    if (authority === "ESRI" && code === "103878") return "projected";
  }
  if (/^(?:URN:OGC:DEF:CRS:OGC:[^:]*:)?CRS84$/.test(upper) || upper === "OGC:CRS84") {
    return "geographic";
  }
  return null;
}

/** Extract the raw name string from a GeoJSON `crs` member, or null if absent/malformed. */
function extractCrsName(geojson: GeoJSONLike): string | null {
  const crs = geojson?.crs;
  if (!crs || typeof crs !== "object") return null;
  if (crs.type === "name" && crs.properties && typeof crs.properties.name === "string") {
    return crs.properties.name;
  }
  if (crs.type === "EPSG" && crs.properties && crs.properties.code != null) {
    return `EPSG:${crs.properties.code}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Coordinate bounds classification
// ---------------------------------------------------------------------------

const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -90;
const LAT_MAX = 90;

type GeoJSONLike = {
  crs?: { type?: string; properties?: { name?: string; code?: string | number } };
  type?: string;
  features?: GeoJSONLike[];
  geometry?: GeoJSONLike | null;
  geometries?: GeoJSONLike[];
  coordinates?: unknown;
};

export class UnsupportedGeoJSONProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedGeoJSONProjectionError";
  }
}

/** Recursively yield every [x, y, ...] coordinate tuple in a GeoJSON coordinates array. */
function* iterateCoordinatePairs(coords: unknown): Generator<[number, number]> {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (typeof coords[0] === "number") {
    if (coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
      throw new UnsupportedGeoJSONProjectionError(
        "GeoJSON contains a malformed or non-finite coordinate pair."
      );
    }
    yield [coords[0], coords[1] as number];
    return;
  }
  for (const item of coords) {
    yield* iterateCoordinatePairs(item);
  }
}

/** Recursively yield every coordinate pair across Feature/FeatureCollection/Geometry shapes. */
function* iterateAllCoordinates(node: GeoJSONLike | null | undefined): Generator<[number, number]> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.features)) {
    for (const feature of node.features) yield* iterateAllCoordinates(feature);
    return;
  }
  if (node.geometry !== undefined) {
    yield* iterateAllCoordinates(node.geometry);
    return;
  }
  if (Array.isArray(node.geometries)) {
    for (const geom of node.geometries) yield* iterateAllCoordinates(geom);
    return;
  }
  if (node.coordinates !== undefined) {
    yield* iterateCoordinatePairs(node.coordinates);
  }
}

/**
 * True when every coordinate in the document is within longitude/latitude bounds.
 * Vacuously true for a document with no coordinates (empty FeatureCollection).
 */
export function isWhollyDegreeBounded(geojson: GeoJSONLike): boolean {
  for (const [x, y] of iterateAllCoordinates(geojson)) {
    if (x < LON_MIN || x > LON_MAX || y < LAT_MIN || y > LAT_MAX) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Top-level resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the OL `dataProjection` to use when reading a GeoJSON document.
 *
 * @param geojson         Parsed GeoJSON document (FeatureCollection/Feature/Geometry).
 * @param nativeProjCode  The mission's own projection code (e.g. "IAU2000:30166"). Used
 *                         as the "already native projected meters" target — no transform
 *                         is applied when the resolved kind is "projected" and this code
 *                         is also passed as `featureProjection`.
 * @throws UnsupportedGeoJSONProjectionError when the document carries a `crs` member
 *         naming a CRS outside the supported compatibility set, or is malformed.
 */
export function resolveGeoJSONDataProjection(geojson: unknown, nativeProjCode: string): string {
  if (!geojson || typeof geojson !== "object") {
    throw new UnsupportedGeoJSONProjectionError("GeoJSON document is malformed (not an object).");
  }
  const doc = geojson as GeoJSONLike;
  if (
    !doc.type ||
    ![
      "FeatureCollection",
      "Feature",
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
      "GeometryCollection",
    ].includes(doc.type)
  ) {
    throw new UnsupportedGeoJSONProjectionError(
      `GeoJSON document has an unsupported or missing type "${String(doc.type)}".`
    );
  }

  const crsName = extractCrsName(doc);
  if (doc.crs != null && !crsName) {
    throw new UnsupportedGeoJSONProjectionError("GeoJSON document has a malformed crs member.");
  }
  if (crsName) {
    const kind = classifyCrsName(crsName);
    if (kind === "geographic") return "EPSG:4326";
    if (kind === "projected") return nativeProjCode;
    throw new UnsupportedGeoJSONProjectionError(
      `Unsupported embedded GeoJSON CRS "${crsName}" — refusing to guess. Supported: ` +
        "EPSG:4326 / OGC:CRS84 / ESRI:104903 (geographic), ESRI:103878 (projected)."
    );
  }

  // No usable crs member: classify by coordinate bounds.
  return isWhollyDegreeBounded(doc) ? "EPSG:4326" : nativeProjCode;
}

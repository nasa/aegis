/**
 * ESRI Vector Tile Info Types
 *
 * Ambient type declarations for tile grid metadata parsed from ArcGIS
 * vector tile package root.json files.  These values are needed to
 * construct an OpenLayers TileGrid for native-projection vector tiles.
 *
 * The same structure is embedded into PMTiles metadata under the
 * `esri_tile_info` key by arcgis_compact_cache_v2_to_pmtiles.py, so consumers can
 * read it from either a standalone root.json or directly from a
 * PMTiles archive via `PMTiles.getMetadata()`.
 */

/** A single Level-of-Detail entry from the ESRI tileInfo.lods array. */
interface EsriLod {
  level: number;
  resolution: number;
  scale: number;
}

/** Spatial reference descriptor (ESRI WKID). */
interface EsriSpatialReference {
  wkid: number;
  latestWkid?: number;
}

/** XY origin for the tile grid. */
interface EsriOrigin {
  x: number;
  y: number;
}

/** Axis-aligned extent (bounding box) in projection units. */
interface EsriExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference: EsriSpatialReference;
}

/**
 * Tile grid information extracted from an ArcGIS root.json.
 *
 * Stored in PMTiles metadata as `esri_tile_info`, or read directly
 * from root.json when serving tiles as individual PBF files.
 */
interface EsriTileInfo {
  rows: number;
  cols: number;
  origin: EsriOrigin;
  spatialReference: EsriSpatialReference;
  lods: EsriLod[];
  initialExtent?: EsriExtent;
  fullExtent?: EsriExtent;
  minScale?: number;
  maxScale?: number;
  minLOD?: number;
  maxLOD?: number;
  name?: string;
}

/**
 * Processed configuration ready for OpenLayers TileGrid construction.
 * Returned by `parseEsriVectorTileInfo()`.
 */
interface EsriVectorTileGridConfig {
  /** Resolution array (meters/pixel per zoom level), ordered z0 → zN. */
  resolutions: number[];
  /** Full extent [xmin, ymin, xmax, ymax] in projection units. */
  extent: [number, number, number, number];
  /** Tile grid origin [x, y] — typically top-left. */
  origin: [number, number];
  /** Tile size in pixels (square). */
  tileSize: number;
  /** Minimum LOD with tile data. */
  minZoom: number;
  /** Maximum LOD with tile data. */
  maxZoom: number;
  /** ESRI WKID for the spatial reference. */
  wkid: number;
}

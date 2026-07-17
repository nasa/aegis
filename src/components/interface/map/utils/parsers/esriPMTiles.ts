/**
 * ESRI PMTiles Parser
 *
 * Contains functions to extract ESRI tile grid metadata from a PMTiles archive
 * and convert it into an OpenLayers TileGrid instance.
 */

import TileGrid from "ol/tilegrid/TileGrid";

/**
 * Parse an EsriTileInfo object into a OpenLayers EsriVectorTileGridConfig
 * so later it can be used to create a OpenLayers TileGrid
 *
 * @param info - The raw ESRI tile info.
 * @param maxLodOverride - Optional upper LOD limit. If provided, resolutions
 *   are truncated at this level. Useful when the highest LODs have very few
 *   tiles and aren't worth loading.
 */
export function parseEsriVectorTileInfo(
  info: EsriTileInfo,
  maxLodOverride?: number
): EsriVectorTileGridConfig {
  const lods = info.lods.slice().sort((a, b) => a.level - b.level);

  const minLod = info.minLOD ?? lods[0].level;
  const maxLod = maxLodOverride ?? info.maxLOD ?? lods[lods.length - 1].level;

  const resolutions = lods
    .filter((l) => l.level >= minLod && l.level <= maxLod)
    .map((l) => l.resolution);

  const ext = info.fullExtent ?? info.initialExtent;
  const extent: [number, number, number, number] = ext
    ? [ext.xmin, ext.ymin, ext.xmax, ext.ymax]
    : [-8388908.78653284, -8388908.78653284, 8388908.78653284, 8388908.78653284];

  const origin: [number, number] = [info.origin.x, info.origin.y];

  const tileSize = info.rows ?? info.cols ?? 512;

  const wkid = info.spatialReference?.wkid ?? info.spatialReference?.latestWkid ?? 0;

  return { resolutions, extent, origin, tileSize, minZoom: minLod, maxZoom: maxLod, wkid };
}

/**
 * Extract EsriTileInfo from PMTiles metadata.
 */
export function parseEsriPmtilesMetadata(
  metadata: Record<string, unknown>,
  maxLodOverride?: number
): EsriVectorTileGridConfig | null {
  // The arcgis_compact_cache_v2_to_pmtiles.py script stores the ESRI info
  // under `metadata.esri_tile_info`.
  const info = metadata.esri_tile_info as EsriTileInfo | undefined;
  if (!info || !Array.isArray(info.lods)) {
    console.warn("[EsriVectorTileInfo] PMTiles metadata missing esri_tile_info.lods");
    return null;
  }
  return parseEsriVectorTileInfo(info, maxLodOverride);
}

/**
 * Build an OpenLayers TileGrid from an `EsriVectorTileGridConfig`.
 * Convenience wrapper so callers don't need to import TileGrid themselves.
 */
export function buildTileGrid(config: EsriVectorTileGridConfig): TileGrid {
  return new TileGrid({
    extent: config.extent,
    origin: config.origin,
    resolutions: config.resolutions,
    tileSize: config.tileSize,
  });
}

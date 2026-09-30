/**
 * Leaflet → OpenLayers Shim for AEGIS
 *
 * Translates Leaflet resolution values into the form OpenLayers
 * TileGrids expect. The primary problem this shim addresses is the
 * `projResUnitsPerPixel` value (e.g. 12800) baked into the AEGIS tile
 * generation pipeline — it doesn't match the raster's native resolution
 * reported by gdal2tiles XML (e.g. 8192), but IS the value used for the
 * actual tiles on S3. Empirically verified 2026-02-12.
 *
 * This translation will have to remain active to support layers
 * generated during the leaflet era.
 *
 * Currently this translation shim is only for tile rater layers.
 * Additional translation functions for tile grids, coordinates, tile URLs,
 * color filters, zoom/resolution conversion, and bounds will be added here
 * as each Leaflet layer type is ported to OpenLayers.
 */

// ─── Resolution Shim ─────────────────────────────────────────────────────────

/**
 * Build the resolution array from Leaflet-era mission settings.
 *
 * Leaflet (via proj4leaflet) computed resolutions as:
 *   baseRes = projResUnitsPerPixel × 2^projResZoomLevel
 *   res[i]  = baseRes / 2^i
 *
 * The projResUnitsPerPixel value (e.g. 12800) is an artifact of the original
 * tile generation pipeline. It does NOT match the raster's native resolution
 * (e.g. 8192 from gdal2tiles XML), but it IS the value that produces tile
 * coordinates matching what exists on S3. Empirically verified 2026-02-12.
 *
 * This function replicates that exact formula so OpenLayers TileGrids produce
 * the same tile coordinates Leaflet would have requested.
 *
 * @param unitsPerPixel - mission.projResUnitsPerPixel (authoritative API value)
 * @param zoomLevel     - mission.projResZoomLevel (reference zoom, usually 0)
 * @param numZoomLevels - number of zoom levels to generate (default: 32);
 *                        pass `maxNativeZoom + 1` when the zoom range is known
 * @returns resolution array, index 0 = most zoomed out
 */
export function buildLegacyResolutions(
  unitsPerPixel: number,
  zoomLevel: number | null,
  numZoomLevels = 32
): number[] {
  const baseRes = unitsPerPixel * Math.pow(2, zoomLevel ?? 0);
  const resolutions: number[] = [];
  for (let i = 0; i < numZoomLevels; i++) {
    resolutions.push(baseRes / Math.pow(2, i));
  }
  return resolutions;
}

/**
 * Build a standard resolution array from tilemapresource.xml values.
 *
 * For missions with tile_grid_version >= 2 (standard gdal2tiles pipeline),
 * the XML units-per-pixel values ARE correct and can be used directly.
 *
 * @param xmlTileSets - parsed TileSet entries from tilemapresource.xml
 * @returns resolution array covering the XML zoom range, or null if empty
 */
// export function buildStandardResolutions(
//   xmlTileSets: { zoom: number; unitsPerPixel: number }[]
// ): number[] | null {
//   if (!xmlTileSets || xmlTileSets.length === 0) return null;

//   const sorted = [...xmlTileSets].sort((a, b) => a.zoom - b.zoom);
//   const baseRes = sorted[0].unitsPerPixel * Math.pow(2, sorted[0].zoom);

//   const resolutions: number[] = [];
//   for (let i = 0; i < sorted.length; i++) {
//     resolutions.push(baseRes / Math.pow(2, i));
//   }
//   return resolutions;
// }

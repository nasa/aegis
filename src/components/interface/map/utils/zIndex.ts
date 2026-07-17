// ---------------------------------------------------------------------------
// Z-index constants — deterministic layer ordering
// ---------------------------------------------------------------------------

/**
 * Z-index assignments for map layers. Higher values render on top.
 * Feature layers (markers, polylines, circles) use these values.
 * Tile/raster layers are ordered by the preset's `layerOrder` array.
 */
export const Z_INDEX = {
  /** Raster/vector base layers start here; preset ordering adds offset */
  BASE_LAYER: 0,

  /** Minor contour GeoJSON */
  MINOR_CONTOURS: 1,

  /** Major contour GeoJSON */
  MAJOR_CONTOURS: 2,

  /** Vector tile contours */
  VECTOR_TILE_CONTOURS: 3,

  /** circles (lander + station) */
  CIRCLES: 6,

  /** Grid lines */
  GRID_LINES: 7,

  /** Grid labels */
  GRID_LABELS: 8,

  /** Traverse / walkback / measurement polylines */
  POLYLINES: 10,

  /** Lander marker */
  LANDER: 11,

  /** Action markers */
  ACTIONS: 12,

  /** Station markers */
  STATIONS: 14,

  /** POI markers */
  POIS: 15,

  /** Hover highlight overlays */
  HOVER: 18,

  /** Selection highlight */
  SELECTION: 19,

  /** Place labels / gazetteer */
  PLACE_LABELS: 20,

  /** Position entry paths */
  POS_ENTRIES: 22,

  /** Position entry markers (above paths + place labels) */
  POS_MARKERS: 23,

  /** Timeline astronaut marker */
  TIMELINE_ASTRONAUT: 28,
} as const;

/**
 * Mode configuration — visual/behavioral parameters per MapMode.
 *
 * Instead of duplicating rendering code, behavior components read numeric
 * parameters (icon sizes, line weights, tooltip opacity, etc.) from this
 * config. The rendering algorithm is the same; only the numbers differ.
 *
 */

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

/**
 * Label parameters for GIS data sublayers (GeoJSON / PMTiles), applied by the
 * layer factory and the gazetteer label style. Split out because those modules
 * take it directly — they are pure and have no `MapMode` of their own.
 */
export interface DataLayerConfig {
  /**
   * When false, no data-layer label is drawn at all — gazetteer place names,
   * thematic anchors, and the inline feature labels alike. Off on the minimap,
   * where they cover more of the map than they inform.
   */
  labelsEnabled: boolean;
  /** Font size (px) for draggable gazetteer / thematic place-name labels. */
  gazetteerFontSize: number;
  /** Font size (px) for inline feature labels (contour elevations, point types). */
  featureFontSize: number;
}

export interface ModeConfig {
  mode: MapMode;

  // Map-level
  map: {
    interactive: boolean;
    showZoomControls: boolean;
    showMouseCoords: boolean;
  };

  // Lander
  lander: {
    iconSize: number;
    clickable: boolean;
    draggable: boolean;
  };

  // Station markers
  station: {
    iconSize: number;
    tooltipPermanent: boolean;
    tooltipOpacity: number;
    clickable: boolean;
    draggable: boolean;
    hoverable: boolean;
    zIndexOffset: number;
    /**
     * When true, show ONLY the running REX EVA's stations, ignoring the eyeball
     * menu / as-planned / folder logic. Used by the minimap so it stays scoped
     * to the active EVA rather than mirroring every station on the big map.
     */
    limitToRunningEva: boolean;
  };

  // Proximity circles
  circle: {
    /** Minimum stroke width (px) for proximity circles, regardless of data `weight`. */
    minWidth: number;
    /** Font size (px) for circle labels, matching other labels at this mode's scale. */
    labelFontSize: number;
  };

  // Traverse lines
  traverse: {
    weight: number;
    selectedWeight: number;
    arrowSize: number;
    arrowRepeat: number;
    clickable: boolean;
    tooltipOpacity: number;
    showBearings: boolean;
    showDistances: boolean;
    bearingLabelFontSize: number;
    bearingLabelColor: string;
    distanceLabelFontSize: number;
    distanceLabelColor: string;
  };

  // Marker labels
  markerLabel: {
    fontSize: number;
    /** Stroke width (px) of the dashed connector line from label to marker. */
    connectorWidth: number;
  };

  // POS entries
  pos: {
    evIconSize: number;
    colorBarOffset: number;
    showOldMarkers: boolean;
    tooltipPermanent: boolean;
    tooltipOpacity: number;
    /**
     * Stroke width (px) for drawn POS path polylines, or `false` to disable
     * path drawing entirely for this mode.
     */
    drawPathWeight: number | false;
  };

  // Grid labels
  grid: {
    labelsEnabled: boolean;
    /** Font size (px) for grid coordinate labels. */
    labelFontSize: number;
  };

  // GIS data sublayer labels
  dataLayer: DataLayerConfig;

  // Scale bar
  scaleBar: {
    /** Font size (px) for the scale-bar label text. */
    fontSize: number;
  };
}

// ---------------------------------------------------------------------------
// Configs per mode
// ---------------------------------------------------------------------------

const EDITOR_CONFIG: ModeConfig = {
  mode: "editor",
  map: {
    interactive: true,
    showZoomControls: true,
    showMouseCoords: true,
  },
  lander: {
    iconSize: 30,
    clickable: true,
    draggable: false,
  },
  station: {
    iconSize: 20,
    tooltipPermanent: true,
    tooltipOpacity: 1,
    clickable: true,
    draggable: true,
    hoverable: true,
    zIndexOffset: 2000,
    limitToRunningEva: false,
  },
  circle: {
    minWidth: 1.5,
    labelFontSize: 14,
  },
  traverse: {
    weight: 3,
    selectedWeight: 6,
    arrowSize: 15,
    arrowRepeat: 50,
    clickable: true,
    tooltipOpacity: 1,
    showBearings: true,
    showDistances: true,
    bearingLabelFontSize: 11,
    bearingLabelColor: "#ffcc00",
    distanceLabelFontSize: 12,
    distanceLabelColor: "#ffffff",
  },
  markerLabel: {
    fontSize: 14,
    connectorWidth: 1.5,
  },
  pos: {
    evIconSize: 20,
    colorBarOffset: 8,
    showOldMarkers: true,
    tooltipPermanent: true,
    tooltipOpacity: 1,
    drawPathWeight: 2,
  },
  grid: {
    labelsEnabled: true,
    labelFontSize: 12,
  },
  dataLayer: {
    labelsEnabled: true,
    gazetteerFontSize: 13,
    featureFontSize: 12,
  },
  scaleBar: {
    fontSize: 13,
  },
};

const DASHBOARD_CONFIG: ModeConfig = {
  mode: "dashboard",
  map: {
    interactive: true,
    showZoomControls: false,
    showMouseCoords: false,
  },
  lander: {
    iconSize: 39,
    clickable: false,
    draggable: false,
  },
  station: {
    iconSize: 34,
    tooltipPermanent: true,
    tooltipOpacity: 0.65,
    clickable: false,
    draggable: false,
    hoverable: false,
    zIndexOffset: 0,
    limitToRunningEva: false,
  },
  circle: {
    minWidth: 3,
    labelFontSize: 20,
  },
  traverse: {
    weight: 8,
    selectedWeight: 0,
    arrowSize: 25,
    arrowRepeat: 140,
    clickable: false,
    tooltipOpacity: 0.65,
    showBearings: true,
    showDistances: true,
    bearingLabelFontSize: 18,
    bearingLabelColor: "#ffcc00",
    distanceLabelFontSize: 20,
    distanceLabelColor: "#ffffff",
  },
  markerLabel: {
    fontSize: 20,
    connectorWidth: 3,
  },
  pos: {
    evIconSize: 40,
    colorBarOffset: 8,
    showOldMarkers: true,
    tooltipPermanent: true,
    tooltipOpacity: 0.65,
    drawPathWeight: 5,
  },
  grid: {
    labelsEnabled: true,
    labelFontSize: 18,
  },
  dataLayer: {
    labelsEnabled: true,
    gazetteerFontSize: 20,
    featureFontSize: 18,
  },
  scaleBar: {
    fontSize: 18,
  },
};

const MINIMAP_CONFIG: ModeConfig = {
  mode: "minimap",
  map: {
    interactive: false,
    showZoomControls: false,
    showMouseCoords: false,
  },
  lander: {
    iconSize: 25,
    clickable: false,
    draggable: false,
  },
  station: {
    iconSize: 20,
    tooltipPermanent: false,
    tooltipOpacity: 1,
    clickable: false,
    draggable: false,
    hoverable: false,
    zIndexOffset: 0,
    limitToRunningEva: true,
  },
  circle: {
    minWidth: 1.5,
    labelFontSize: 12,
  },
  traverse: {
    weight: 5,
    selectedWeight: 0,
    arrowSize: 15,
    arrowRepeat: 50,
    clickable: false,
    tooltipOpacity: 0,
    showBearings: false,
    showDistances: false,
    bearingLabelFontSize: 11,
    bearingLabelColor: "#ffcc00",
    distanceLabelFontSize: 12,
    distanceLabelColor: "#ffffff",
  },
  markerLabel: {
    fontSize: 12,
    connectorWidth: 1.5,
  },
  pos: {
    evIconSize: 20,
    colorBarOffset: 6,
    showOldMarkers: false,
    tooltipPermanent: false,
    tooltipOpacity: 0,
    drawPathWeight: false,
  },
  grid: {
    labelsEnabled: false,
    labelFontSize: 11,
  },
  dataLayer: {
    labelsEnabled: false,
    gazetteerFontSize: 11,
    featureFontSize: 11,
  },
  scaleBar: {
    fontSize: 18,
  },
};

export const MODE_CONFIGS: Record<MapMode, ModeConfig> = {
  editor: EDITOR_CONFIG,
  dashboard: DASHBOARD_CONFIG,
  minimap: MINIMAP_CONFIG,
};

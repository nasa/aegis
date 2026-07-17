/**
 * OpenLayers Map Component Types
 *
 * TypeScript interfaces and types for the AEGIS OpenLayers map implementation.
 */

/**
 * Tile profile type - determines how tiles are generated and loaded
 *
 * - "mercator": Standard Web Mercator tile grid (EPSG:3857)
 *   - Used when projIsCustom=false or projection is Web Mercator-based
 *   - BoundingBox in degrees, transform to meters for OpenLayers
 *
 * - "raster": Custom tile grid matching gdal2tiles raster output
 *   - Used when projIsCustom=true with non-Mercator projection (e.g., Polar Stereographic)
 *   - BoundingBox in projection units (meters)
 *   - Requires custom TileGrid with resolutions/origin from mission settings
 */
type TileProfile = "mercator" | "raster";

/**
 * Layer control state for UI
 * Tracks visibility and opacity for each sublayer
 */
interface LayerControlState {
  uuid: string;
  name: string;
  type: SublayerType;
  visible: boolean;
  opacity: number;
  zIndex?: number;
}

/**
 * Internal layer registry entry
 * Maps sublayer UUID to its OpenLayers layer instance
 */
interface LayerRegistryEntry {
  sublayer: Sublayer;
  olLayer: unknown; // OpenLayers Layer instance (null = not yet created)
}

/**
 * Mission projection context
 * Computed projection settings based on mission configuration
 */
interface ProjectionContext {
  /** Tile generation profile */
  tileProfile: TileProfile;
  /** Projection code (e.g., "EPSG:3857" or "AEGIS:25") */
  projCode: string;
  /** OpenLayers projection object */
  projection: unknown; // OpenLayers Projection instance
  /** Projection extent [minX, minY, maxX, maxY] in projection units */
  extent: [number, number, number, number] | null;
  /** Resolution pyramid for custom projections */
  resolutions: number[] | null;
  /** Tile grid origin [x, y] */
  origin: [number, number] | null;
}

/**
 * Map view state
 */
interface MapViewState {
  center: [number, number];
  zoom: number;
}

/**
 * Props for the OLMap component
 */
interface OLMapProps {
  /** Mission data with projection settings */
  mission: Mission;
  /** Available sublayers for this mission */
  sublayers: Sublayer[];
  /** Initial layer visibility states (keyed by UUID) */
  initialVisibility?: Record<string, boolean>;
  /** Initial layer opacities (keyed by UUID) */
  initialOpacities?: Record<string, number>;
  /** Callback when layer controls change */
  onLayerControlsChange?: (controls: LayerControlState[]) => void;
  /** Optional class name for the map container */
  className?: string;
  /** Optional inline styles for the map container */
  style?: React.CSSProperties;
}

/**
 * Props for the LayerControlPanel component
 */
interface LayerControlPanelProps {
  /** Layer control states */
  controls: LayerControlState[];
  /** Callback when visibility is toggled */
  onVisibilityToggle: (uuid: string) => void;
  /** Callback when opacity changes */
  onOpacityChange: (uuid: string, opacity: number) => void;
  /** Optional class name */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

/**
 * Debug information for map state
 */
interface MapDebugInfo {
  tileProfile: TileProfile;
  projCode: string;
  projIsCustom: boolean;
  bounds: [number, number, number, number] | null;
  origin: [number, number] | null;
  resolution: number | null;
  resolutionZoomLevel: number | null;
}

/**
 * Layer factory options
 */
interface LayerFactoryOptions {
  sublayer: Sublayer;
  mission: Mission;
  projectionContext: ProjectionContext;
  zIndex: number;
  visible?: boolean;
  opacity?: number;
}

/**
 * OpenLayers Map Handle
 * Methods exposed via ref from OLMap component
 */
interface OLMapHandle {
  /** Get the underlying OpenLayers map instance */
  getMap: () => unknown; // OpenLayers Map instance
  /** Toggle visibility of a layer by UUID */
  toggleLayerVisibility: (uuid: string) => void;
  /** Set opacity of a layer by UUID */
  setLayerOpacity: (uuid: string, opacity: number) => void;
  /** Get current layer control states */
  getLayerControls: () => LayerControlState[];
}

// Map modes — one component, three configurations
type MapMode = "editor" | "dashboard" | "minimap";

/**
 * Basic concept of a point
 */
type Point = {
  lat: number;
  long: number;
  elevation?: number;
};

/**
 * "Planets" allowed by this app
 */
type Planet = {
  name: "Earth" | "Moon" | "Mars";
  radiusMajor: number;
  radiusMinor: number;
};

/**
 * All drawing features should include location, categorization, labeling, and notes. The different
 * feature types (DrawingHazard, DrawingNote, DrawingAction, etc) will add on more info.
 *
 * DrawingFeature should not be used directly (it's abstract). Instead use one of the types that
 * extends it. Every extending type must have a `featureType` property as a type guard.
 */
type DrawingFeature = {
  uuid: string;
  name: string;
  owner: string;
  description: string;
  location: Point | Point[];
  categories: string[];
  label: string; // "M-6"
  showLabel: boolean;
  notes: UserComments;
};

/**
 * DrawingFeature for showing an area where a hazard is
 */
type DrawingHazard = DrawingFeature & {
  featureType: "Hazard";

  /**
   *
   */
  hazardType: "slope" | "ruggedness" | "aliens" | "other";

  /**
   * This is just Point[], not Point | Point[] like the base DrawingFeature, since a hazard can't
   * be at just one point. There must be some area to it, even if it's a very small hazard.
   */
  location: Point[];
};

/**
 * Non-actionable (see DrawingAction) feature on a map.
 */
type DrawingNote = DrawingFeature & {
  featureType: "Note";
};

/**
 * Holds array of DrawingFeature to be displayed on the map (probably in a leaflet layer).
 */
type DrawingFeatureGroup = {
  uuid: string;
  owner: string;
  name: string;
  description: string;
  features: DrawingFeature[];
  planet: Planet;
};

/**
 * Categorized groups of externally loaded map layer data (e.g. tilesets or vectors) NOT drawn things.
 */
type LayerGroup = {
  name: string;
  layers: TileLayer[] | VectorLayer[];
};

/**
 * Map layer data (e.g. tilesets or vectors) NOT drawn things.
 */
type Layer = {
  name: string;
  createdOn: Date;
  description: string;
  initialOpacity: number;
  opacity: number;
  url: string;
  visible: boolean;
};

/**
 * A map layer consisting of a tileset.
 */
type TileLayer = Layer & {
  type: "TileLayer";
  tileFormat: "tms" | "wmts";
  demTileUrl: string;
  legendUrl: string;
  minZoom: number;
  maxNativeZoom: number;
  maxZoom: number;
  boundingBox: number[];
};

/**
 * A map layer consisting of a geoJSON vector data set.
 */
type VectorLayer = Layer & {
  type: "VectorLayer";
  vectorLayerStyle: VectorLayerStyle;
};

type VectorLayerStyle = {
  color: string;
  fillColor: string;
  weight: number;
  fillOpacity?: any;
};

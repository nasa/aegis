/**
 * Basic concept of a point
 */
type AEGISPoint = {
  lat: number;
  lng: number;
  alt?: number;
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
  location: AEGISPoint | AEGISPoint[];
  categories: string[];
  label: string; // "M-6"
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
  location: AEGISPoint[];
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

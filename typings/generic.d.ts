/**
 * Anything that takes comments should allow
 */
type UserComments = Record<string, string>;

/**
 * Some object that we haven't figured out
 */
type WeDontKnowYet = Record<string, string>;

interface Mission {
  owner: string;
  name: string;
  version: number;
  planet: Planet;
  description: string;
  layers: LayerGroup[];
  drawingGroups: DrawingFeatureGroup[];
  itineraries: Itinerary[];
  projection: Projection;
  defaultView: MapView;
}

interface Projection {
  epsg: string;
  proj: string;
  bounds: string[];
  origin: string[];
  reszoomlevel: number;
  resunitsperpixel: number;
}

interface MapView {
  latitude: number;
  longitude: number;
  zoom: number;
}

/**
 * From MapSelector component
 */
type ExpandedSection = {
  systemPresets: boolean;
  userPresets: boolean;
  details: boolean;
};
type SetExpandedSectionsFn = (expandedSection: ExpandedSection) => void;

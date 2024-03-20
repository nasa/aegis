/**
 * Basic concept of a point
 */
type AEGISPoint = {
  lat: number;
  lng: number;
  alt?: number;
};

/**
 * Communication between the map and the store
 */
type MapAction =
  | "createMarker"
  | "cancelCreateMarker"
  | "editMarker"
  | "cancelEditMarker"
  | "editPolyline"
  | "saveEditPolyline"
  | "cancelEditPolyline"
  | "refreshLocation"
  | "delete";

type MapItemType = `${MapMarkerType | MapPolylineType}`;

interface MapDirective {
  uuid: string;
  mapItemType: MapItemType;
  mapAction: MapAction;
}

/**
 * Station / POI map view state
 */
interface MapDisplayMarkers {
  show: boolean;
  showLabels: boolean;
}

/**
 * Pos map view state
 */
interface MapDisplayPositions {
  show: boolean;
  showAllLabels: boolean;
  showLatestLabels: boolean;
  showPaths: boolean;
  showOldPaths: boolean;
  fadeOldPaths: boolean;
  showMarkers: boolean;
  showOldMarkers: boolean;
  fadeOldMarkers: boolean;
}

/**
 * Cookie for map view settings
 */
type EyeballMenuCookieAEGISMapViewSettings = {
  mapDisplayPois: MapDisplayMarkers;
  mapDisplayStations: MapDisplayMarkers;
  mapDisplayActions: MapDisplayMarkers;
  mapDisplayPositions: MapDisplayPositions;
  showArrows: boolean;
  showGridLabels: boolean;
};

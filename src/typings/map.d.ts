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
 * marker map view state
 */
interface MapDisplayMarkers {
  show: boolean;
  showLabels: boolean;
}

/**
 * Pos map view state
 */
interface MapDisplayPos {
  show: boolean;
  showAllLabels: boolean;
  showLatestLabels: boolean;
  showPaths: boolean;
  showOldPaths: boolean;
  fadeOldPaths: boolean;
  showMarkers: boolean;
  showOldMarkers: boolean;
  fadeOldMarkers: boolean;
  sourceUuids: string[];
}

/**
 * station map view state
 */
interface MapDisplayStations extends MapDisplayMarkers {
  showWalkbacks: boolean;
}

/**
 * Cookie for map view settings
 */
type EyeballMenuCookieAEGISMapViewSettings = {
  mapDisplayPois: MapDisplayMarkers;
  mapDisplayStations: MapDisplayStations;
  mapDisplayActions: MapDisplayMarkers;
  mapDisplayPos: MapDisplayPos;
  showArrows: boolean;
  showGridLabels: boolean;
  showGridLines: boolean;
};

/*
 * Map Follow View Settings for dashboard
 */
type MapFollowOptions = {
  [uuid: string]: {
    //uuid should be either the pos type uuid or the word "station" or "traverse"
    follow: boolean;
    name: string;
  };
};

type MissionSelectProperties = Pick<
  Mission,
  | "id"
  | "landerLocation"
  | "initialZoom"
  | "planetRadius"
  | "activeGridUuid"
  | "projBoundsMaxX"
  | "projBoundsMaxY"
  | "projBoundsMinX"
  | "projBoundsMinY"
  | "projEpsg"
  | "projProj4String"
  | "projResZoomLevel"
  | "projResUnitsPerPixel"
  | "projIsCustom"
  | "projOriginX"
  | "projOriginY"
  | "landerRadii"
>;

type GridLabelItem = {
  id: string;
  latLng: L.LatLngExpression;
};

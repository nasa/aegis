/**
 * Basic concept of a point
 */
type AEGISPoint = {
  lat: number | null;
  lng: number | null;
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

type MapMarkerType = "poi" | "station" | "lander" | "hover" | "action" | "posEntry";
type MapPolylineType = "traverse" | "walkback" | "hover" | "posPath" | "measurement";
type MapCircleType = "stationCircle" | "landerCircle";

type MapItemType = `${MapMarkerType | MapPolylineType | MapCircleType}`;

interface MapDirective {
  uuid: string;
  mapItemType: MapItemType;
  mapAction: MapAction;
}

/**
 * marker menu state
 */
interface MapSubmenuMarkers {
  show: boolean;
  showLabels: boolean;
}

/**
 * Pos menu state
 */
interface MapSubmenuPos {
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
 * station menu state
 */
interface MapSubmenuStations extends MapSubmenuMarkers {
  showWalkbacks: boolean;
  showCircles: boolean;
}

/**
 * Cookie for map menu settings
 */
type MapMenuCookie = {
  submenuStations: MapSubmenuStations;
  submenuPois: MapSubmenuMarkers;
  submenuActions: MapSubmenuMarkers;
  submenuPos: MapSubmenuPos;
  showArrows: boolean;
  showBearings?: boolean;
  showDistances?: boolean;
  showSunEarth: boolean;
  showScaleBar: boolean;
  showMouseLatLon: boolean;
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
  | "circleDefinitions"
  | "usingLGRSCoordinates"
  | "actionDefinitions"
>;

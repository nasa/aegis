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
interface MapMarkersDisplay {
  show: boolean;
  showLabels: boolean;
}

/**
 * CrewPos map view state
 */
interface MapCrewPosDisplay {
  show: boolean;
  showPaths: boolean;
  showAllLabels: boolean;
  showLatestLabels: boolean;
  fadeOldPositions: boolean;
}

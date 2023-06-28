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

type DrawControlItem = {
  uuid: string;
  drawControl: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  drawHandler: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  drawnItemsFeatureGroup: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  mapItemType: MapItemType;
};

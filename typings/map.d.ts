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

type MapItemType = "poi" | "station" | "traverse" | "antPath" | "walkback";
interface MapDirective {
  uuid: string;
  mapItemType: MapItemType;
  mapAction: MapAction;
}

type DrawControlItem = {
  uuid: string;
  drawControl: any;
  drawHandler: any;
  drawnItemsFeatureGroup: any;
  mapItemType: MapItemType;
};

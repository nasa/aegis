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
  | "cancelCreate"
  | "cancelEdit"
  | "create"
  | "edit"
  | "saveEdit"
  | "refreshLocation"
  | "delete";

type MapItemType = "poi" | "station" | "traverse";
interface UserMapObject {
  uuid: string;
  mapItemType: MapItemType;
  createdAt: string;
  mapAction: MapAction;
}

type DrawControlItem = {
  uuid: string;
  drawControl: any;
  drawHandler: any;
  drawnItemsFeatureGroup: any;
  mapItemType: MapItemType;
};

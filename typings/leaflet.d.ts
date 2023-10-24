/**
 * Leaflet marker with a uuid property
 */

type AEGISMarker = L.Marker & {
  uuid?: string;
  mapItemType: MapMarkerType;
};

type MapMarkerType = "poi" | "station" | "lander" | "hover" | "action" | "crewPos";

type AEGISPolyline = L.Polyline & {
  uuid?: string;
  mapItemType: MapPolylineType;
};

type MapPolylineType = "traverse" | "walkback" | "antPath" | "hover" | "crewPosPath";

type AEGISMapDrawingLayer = L.Layer & {
  uuid?: string;
  mapItemType: MapItemType;
};

type AEGISCircleMarker = L.CircleMarker & {
  mapItemType: "selected" | "hover";
};

type CircleWithUuid = L.Circle & {
  uuid?: string;
  mapItemType?: "radius";
};

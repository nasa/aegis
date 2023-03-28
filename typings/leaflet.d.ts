/**
 * Leaflet marker with a uuid property
 */
type FeatureGroupWithUuid = L.FeatureGroup & {
  uuid?: string;
};

type AEGISMarker = L.Marker & {
  uuid?: string;
  mapItemType: MapMarkerType;
};

type MapMarkerType = "poi" | "station" | "lander" | "hover";

type AEGISPolyline = L.Polyline & {
  uuid?: string;
  mapItemType: MapPolylineType;
};

type MapPolylineType = "traverse" | "walkback" | "antPath" | "hover";

type AEGISMapLayer = L.Layer & {
  uuid?: string;
  mapItemType: MapItemType;
};

type AEGISCircleMarker = L.CircleMarker & {
  mapItemType: "selected" | "hover";
};

type CircleWithUuid = L.Circle & {
  uuid?: string;
};

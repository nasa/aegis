/**
 * Leaflet marker with a uuid property
 */
type FeatureGroupWithUuid = L.FeatureGroup & {
  uuid?: string;
};

type AEGISMarker = L.Marker & {
  uuid?: string;
  mapItemType: "poi" | "station" | "lander";
};

type AEGISPolyline = L.Polyline & {
  uuid?: string;
  mapItemType: "traverse" | "walkback" | "hover";
};

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

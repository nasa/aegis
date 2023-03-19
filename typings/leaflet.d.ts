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
  mapItemType: "traverse" | "walkback";
};

type AEGISMapLayer = L.Layer & {
  uuid?: string;
  mapItemType: MapItemType;
};

type AEGISCircleMarker = L.CircleMarker & {
  mapItemType: "selectedMarker";
};

type CircleWithUuid = L.Circle & {
  uuid?: string;
};

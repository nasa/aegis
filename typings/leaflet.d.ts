/**
 * Leaflet marker with a uuid property
 */
type FeatureGroupWithUuid = L.FeatureGroup & {
  uuid?: string;
};

type MarkerWithUuid = L.Marker & {
  uuid?: string;
};

type PolylineWithUuid = L.Polyline & {
  uuid?: string;
};

type CircleMarkerWithUuid = L.CircleMarker & {
  uuid?: string;
};

type CircleWithUuid = L.Circle & {
  uuid?: string;
};

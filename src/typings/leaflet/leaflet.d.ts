/**
 * Leaflet marker with a uuid property
 */
type AEGISMarker = L.Marker & {
  uuid?: string;
  mapItemType: MapMarkerType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _icon: any; // expose this private variable to manipulate interactive property
};

type MapMarkerType = "poi" | "station" | "lander" | "hover" | "action" | "posEntry";

type AEGISPolyline = L.Polyline & {
  uuid?: string;
  mapItemType: MapPolylineType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _path: any; // expose this private variable to manipulate interactive property
};

type MapPolylineType = "traverse" | "walkback" | "hover" | "posPath" | "measurement";

type AEGISDecorator = L.Layer & {
  uuid?: string;
  mapItemType: MapPolylineType;
};

type AEGISMapDrawingLayer = L.Layer & {
  uuid?: string;
  mapItemType: MapItemType;
};

type AEGISCircleMarker = L.CircleMarker & {
  mapItemType: "selected" | "hover";
};

type AEGISGeoJSONCircle = L.GeoJSON & {
  uuid?: string;
  mapItemType: "Lander Radius";
};

type AEGISGeoJSONGrid = L.GeoJSON & {
  uuid?: string;
  mapItemType: "Grid System";
};

type AEGISGeoJSONGridPoint = L.Tooltip & {
  uuid?: string;
  mapItemType: "Grid Point";
};

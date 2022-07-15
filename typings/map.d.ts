interface LayerControl {
  name: string;
  enabled: boolean;
  type: string;
  expanded: boolean;
  mapLayerRef: any;
  opacity: number;
}

interface LayerControls {
  [key: string]: LayerControl;
}

interface MapDrawnItem {
  position?: LatLng;
  latLngsJSON?: string;
  uuid: string;
}

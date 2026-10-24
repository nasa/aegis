interface Window {
  __aegisMaps?: {
    map: import("ol/Map").default;
    mode: MapMode;
  }[];
}

interface PlaywrightMapFeature {
  id: string;
  name: string;
  labelType: string | null;
  geometryType: string | null;
  coordinates: unknown;
  layerZIndex: number;
  visible: boolean;
}

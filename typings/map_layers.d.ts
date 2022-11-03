interface LayerControl {
  name: string;
  enabled: boolean;
  type: string;
  expanded: boolean;
  mapLayerRef: any;
  style: LayerControlStyle;
}

interface LayerControlStyle {
  opacity: number;
  contrast: number;
  brightness: number;
  saturation: number;
  blendMode: string;
}

interface LayerControls {
  [key: string]: LayerControl;
}

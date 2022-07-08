interface LayerControl {
  name: string;
  enabled: boolean;
  type: string;
  expanded: boolean;
}

interface LayerControls {
  [key: string]: LayerControl;
}

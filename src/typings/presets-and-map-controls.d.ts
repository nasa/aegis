interface MapSublayerControl {
  name: string;
  sublayerUuid: string;
  visible: boolean;
  style: MapSublayerStyle;
}

interface MapCircleControl {
  uuid: string;
  visible: boolean;
  style: MapSublayerStyle;
}

interface MapGridControl {
  visible: boolean;
  labelsVisible: boolean;
  style: MapSublayerStyle;
}

interface MapSublayerStyle {
  opacity: number; // Percent
  contrast: number; // Percent
  brightness: number; // Percent
  saturation: number; // Percent
  blendMode: string;
  color: string; // stroke color
  weight: number; // stroke weight
  fillColor: string;
  fillOpacity: number;
  isDashed: boolean;
  dashLen: number;
  altColor: string; // for dashed lines
  altOpacity: number; // for dashed lines
  showLabels?: boolean; // vector / vector-tile: draw per-feature labels (e.g. contour elevations)
  labelMinZoom?: number; // vector / vector-tile: only draw labels when the map zoom >= this level. Undefined = always. Prevents crowded labels when zoomed out.
  labelColor?: string; // label text color (grid labels; vector labels use `color`)
  labelHaloColor?: string; // halo (outline) color behind label text
  labelHaloWidth?: number; // halo width in pixels
  labelHaloOpacity?: number; // halo opacity (0–1)
}

type MapSublayerStyleKeys = keyof MapSublayerStyle;

interface MapSublayerControls {
  [uuid: string]: MapSublayerControl; // uuid of sublayers
}

interface MapCircleControls {
  [uuid: string]: MapCircleControl; // uuid
}

interface LayersUIStates {
  [uuid: string]: LayerUIStates; // uuid of Layer, or station
}

interface LayerUIStates {
  [uuid: string]: LayerUIState; // flat uuid of layers and sublayers headers
}

interface LayerUIState {
  expanded: boolean;
  tabSelected: "info" | "sliders";
  name: string;
  type: "layer" | "sublayer" | "circle";
}

interface CirclesUIStates {
  [uuid: string]: CircleUIStates; // uuid of Preset or Station
}

interface CircleUIStates {
  [uuid: string]: CircleUIState; // flat uuid of layers and sublayers headers
}

interface CircleUIState {
  slidersSelected: boolean;
}

type Preset = {
  uuid: string;
  ownerId: number;
  missionId: number;
  name: string;
  description: string;
  missionDefault: boolean;
  mapSublayerControls: MapSublayerControls; // flattened list of layers/sublayers
  mapCircleControls: MapCircleControls;
  mapGridControl: MapGridControl;
  layerOrder: PresetLayerOrder[];
  sunAzimuth: number;
  sunEnabled: boolean;
  earthAzimuth: number;
  earthEnabled: boolean;
  earthAsMoon: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type PresetLayerOrder = {
  layerUuid: string;
  sublayerUuids: string[];
};

type Preset_db_type = Omit<Preset, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

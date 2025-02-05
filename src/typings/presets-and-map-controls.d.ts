interface MapSublayerControl {
  name: string;
  sublayerUuid: string;
  visible: boolean;
  style: MapSublayerStyle;
}

interface MapCircleControl {
  name: string;
  uuid: string;
  visible: boolean;
  style: MapSublayerStyle;
}

interface MapSublayerStyle {
  opacity: number; //Percent
  contrast: number; //Percent
  brightness: number; //Percent
  saturation: number; //Percent
  blendMode: string;
  color: string; //stroke color
  weight: number; //stroke weight
  fillColor: string;
  fillOpacity: number;
}

type MapSublayerStyleKeys = keyof MapSublayerStyle;

interface MapSublayerControls {
  [key: string]: MapSublayerControl; //uuid of sublayers
}

interface MapCircleControls {
  [key: string]: MapCircleControl; //uuid
}

interface LayersUIStates {
  [key: string]: LayerUIStates; //uuid of Layer, or station
}

interface LayerUIStates {
  [key: string]: LayerUIState; //flat uuid of layers and sublayers headers
}

interface LayerUIState {
  expanded: boolean;
  tabSelected: "info" | "sliders";
  name: string;
  type: "layer" | "sublayer" | "circle";
}

interface CirclesUIStates {
  [key: string]: CircleUIStates; //uuid of Preset or Station
}

interface CircleUIStates {
  [key: string]: CircleUIState; //flat uuid of layers and sublayers headers
}

interface CircleUIState {
  name: string;
  slidersSelected: boolean;
}

type Preset = {
  uuid: string;
  ownerId: number;
  missionId: number;
  name: string;
  description: string;
  missionPreset: boolean;
  missionPresetDefault: boolean;
  mapSublayerControls: MapSublayerControls; //flattened list of layers/sublayers
  mapCircleControls: MapCircleControls;
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

type Preset_db_type = Omit<Preset, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

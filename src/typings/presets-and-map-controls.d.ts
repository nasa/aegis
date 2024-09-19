interface MapSublayerControl {
  name: string;
  sublayerUuid: string;
  visible: boolean;
  style: MapSublayerStyle;
}

interface MapCircleControl {
  name: string;
  landerRadiusUuid: string;
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

interface MapSublayerControls {
  [key: string]: MapSublayerControl; //uuid of sublayers
}

interface MapCircleControls {
  [key: string]: MapCircleControl; //uuid
}

interface PresetsUIStates {
  [key: string]: PresetUIStates; //uuid of preset
}

interface PresetUIStates {
  [key: string]: PresetUIState; //flat uuid of layers and sublayers headers
}

interface PresetUIState {
  expanded: boolean;
  tabSelected: "info" | "sliders";
  name: string;
  type: "layer" | "sublayer" | "circle";
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

type Preset_db_type = Omit<Preset, "ownerId" | "missionId" | "createdAt" | "updatedAt"> & {
  owner: User_db_type;
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

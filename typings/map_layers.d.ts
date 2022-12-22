interface LayerControl {
  name: string;
  enabled: boolean;
  type: string;
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

/** Represents the DB structure for the Layer table */
interface Layer {
  uuid: string;
  mission: number;
  layerConfig: MMGIS_LayerConfig; //layers from the mmgis config
  createdAt: Date;
  updatedAt: Date;
}

type Preset = {
  id?: number;
  uuid: string;
  name: string;
  description: string;
  owner: number;
  mission: number;
  missionPreset: boolean;
  missionPresetDefault: boolean;
  layerControls: LayerControls;
  createdAt?: Date;
  updatedAt?: Date;
};

interface PresetInteractions {
  [key: string]: LayerControlInteractions;
}

interface LayerControlInteractions {
  [key: string]: LayerControlInteraction;
}

interface LayerControlInteraction {
  expanded: boolean;
  tabSelected: LayerDetailsTabs;
}

type LayerDetailsTabs = "info" | "sliders";

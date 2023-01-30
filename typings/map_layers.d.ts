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
  missionId: number;
  layerConfig: LayerConfig;
  createdAt: Date;
  updatedAt: Date;
}

//custom type based off of MMGIS type
type LayerConfig = Omit<MMGIS_LayerConfig, "sublayers"> & {
  sublayers?: Sublayer[];
};

//add a custom description field to MMGIS sublayers
interface Sublayer extends MMGIS_Sublayer {
  description?: string;
}

type Layer_db_type = Omit<Layer, "missionId"> & {
  mission: Mission_db_type;
};

type Preset = {
  uuid: string;
  ownerId: number;
  missionId: number;
  name: string;
  description: string;
  missionPreset: boolean;
  missionPresetDefault: boolean;
  layerControls: LayerControls;
  createdAt?: Date;
  updatedAt?: Date;
};

type Preset_db_type = Omit<Preset, "ownerId" | "missionId"> & {
  owner: User;
  mission: Mission_db_type;
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

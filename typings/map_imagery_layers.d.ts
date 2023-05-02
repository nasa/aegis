interface LayerControl {
  name: string;
  enabled: boolean;
  type: string;
  mapLayerRef: any;
  style: LayerControlStyle;
}

interface LayerControlStyle {
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

interface LayerControls {
  [key: string]: LayerControl;
}

interface LayerControlInteractions {
  [key: string]: LayerControlInteraction;
}

interface LayerControlInteraction {
  expanded: boolean;
  tabSelected: LayerDetailsTabs;
}

type LayerDetailsTabs = "info" | "sliders";

/** Represents the DB structure for the Layer table */
interface Layer {
  uuid: string;
  missionId: number;
  layerConfig: LayerConfig;
  createdAt: string;
  updatedAt: string;
}

type Layer_db_type = Omit<Layer, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

//custom type based off of MMGIS type
type LayerConfig = Omit<MMGIS_LayerConfig, "sublayers"> & {
  sublayers?: Sublayer[];
};

//add a custom description field to MMGIS sublayers
interface Sublayer extends MMGIS_Sublayer {
  description?: string;
  uuid?: string;
  aegisURL?: string;
}

type Preset = {
  uuid: string;
  ownerId: number;
  missionId: number;
  name: string;
  description: string;
  missionPreset: boolean;
  missionPresetDefault: boolean;
  layerControls: LayerControls;
  createdAt?: string;
  updatedAt?: string;
};

type Preset_db_type = Omit<Preset, "ownerId" | "missionId" | "createdAt" | "updatedAt"> & {
  owner: User_db_type;
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

interface PresetInteractions {
  [key: string]: LayerControlInteractions;
}

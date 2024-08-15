/** Represents the DB structure for the Layer table */
interface Layer {
  uuid: string;
  missionId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

type Layer_db_type = Omit<Layer, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type SublayerType = "vector" | "tile" | "circle" | "vector-tile";

//add a custom description field to MMGIS sublayers
interface Sublayer {
  uuid: string;
  missionId: number;
  layerUuid: string;
  name: string;
  description: string;
  legend: Legend;
  type: SublayerType;
  url: string;
  filePath: string; // for vector layers
  boundingBox: number[];
  tileFormat: string;
  minNativeZoom: number;
  maxNativeZoom: number;
  maxZoom: number;
  color: string;
  opacity: number;
  fillColor: string;
  fillOpacity: number;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

type Sublayer_db_type = Omit<Sublayer, "missionId" | "layerUuid" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  layer: Layer_db_type;
  createdAt: Date;
  updatedAt: Date;
};

interface Legend {
  legend: LegendItem[];
  unitsAbbr: string;
  version: string;
}
interface LegendItem {
  color: string;
  description: string;
}

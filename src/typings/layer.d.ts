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

type SublayerType = "vector" | "tile" | "vector-tile";

//add a custom description field to MMGIS sublayers
interface Sublayer {
  uuid: string;
  missionId: number;
  layerUuid: string;
  type: SublayerType;
  name: string;
  description: string;
  legend: Legend;
  path: string;
  tilePattern: string;
  boundingBox: number[];
  tileFormat: string;
  minNativeZoom: number;
  maxNativeZoom: number;
  maxZoom: number;
  style: MapSublayerStyle;
  isTimeBased: boolean;
  timeLayerManifest: TimeLayerInfo[];
  createdAt: string;
  updatedAt: string;
}

// properties that are allowable to be overriden with properties.json in admin
type SublayerImportable = Partial<
  Pick<
    Sublayer,
    | "type"
    | "name"
    | "description"
    | "legend"
    | "tilePattern"
    | "boundingBox"
    | "tileFormat"
    | "minNativeZoom"
    | "maxNativeZoom"
    | "maxZoom"
    | "style"
  >
>;

interface SublayerToDraw extends Sublayer {
  chosenTimeLayer: TimeLayerInfo;
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

// datetime is an iso-readable string
interface TimeLayerJson {
  datetime: string;
  dirName: string;
}

// datetime, lowerBound, and upperBound should be ISO strings
interface TimeLayerInfo {
  datetime: string;
  dirName: string;
  lowerBound: string;
  upperBound: string;
}

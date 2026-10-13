/** Represents the DB structure for the Layer table */
interface Layer {
  uuid: string;
  missionId: number;
  name: string;
  createdAt: number;
  updatedAt: number;
}

type SublayerType = "vector" | "tile" | "vector-tile";

//add a custom description field to sublayers
interface Sublayer {
  uuid: string;
  missionId: number;
  layerUuid: string;
  type: SublayerType;
  name: string;
  description: string;
  legend: Legend | null;
  path: string;
  tilePattern: string | null;
  boundingBox: number[] | null;
  tileFormat: string | null;
  minNativeZoom: number | null;
  maxNativeZoom: number | null;
  maxZoom: number | null;
  isTimeBased: boolean;
  timeLayerManifest: TimeLayerInfo[];
  createdAt: number;
  updatedAt: number;
}

// properties that are allowable to be overridden with properties.json in admin
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
  >
>;

interface SublayerToDraw extends Sublayer {
  chosenTimeLayer: TimeLayerInfo;
}

interface Legend {
  legend: LegendItem[];
  unitsAbbr: string;
  unitsName?: string;
  version: string;
}
interface LegendItem {
  color: string;
  description: string;
  // Present on legends imported from discrete-class (e.g. viewshed) products
  value?: string;
  shape?: string;
  strokecolor?: string;
}

// datetime is an iso-readable string
interface TimeLayerJson {
  datetime: string;
  dirName: string;
  lowerBound?: string;
  upperBound?: string;
}

// datetime, lowerBound, and upperBound should be ISO strings
interface TimeLayerInfo {
  datetime: string;
  dirName: string;
  lowerBound: string;
  upperBound: string;
}

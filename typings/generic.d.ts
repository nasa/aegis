/**
 * The mission object
 */
interface Mission {
  id: number;
  name: string;
  description: string;
  config: Config;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  landerLocation?: AEGISPoint;
  landerElevationMeters?: number;
  traverseSpeed?: number;
  sunAzimuth: number;
  earthAzimuth: number;
  sunAzimuthVisible: boolean;
  earthAzimuthVisible: boolean;
  defaultEvaDuration: number;
}

// No alteration needed to convert this store type to the database type
type Mission_db_type = Omit<Mission, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

/** AEGIS version of Config JSON object from MMGIS.
 * Contains all the same properties with the exception of Layers */
interface Config {
  layers: (Omit<MMGIS_LayerConfig, "sublayers"> & { sublayers?: Sublayer[] })[];
  msv: MMGIS_Msv;
  projection: MMGIS_Projection;
  look: MMGIS_Look;
  panels: string[];
  panelSettings: MMGIS_PanelSettings;
  tools: MMGIS_Tool[];
  time: MMGIS_ConfigTime;
  missionBanner: string;
}

/**
 * The object we put in the "measure tool" area of MMGIS config about the dem
 */
type DemConfig = {
  dem: string;
  resolution: number;
};

type GISfile = {
  name: string;
  isDir: boolean;
  fileCount: number;
};

/**
 * From MapSelector component
 */
type MapExpandedSections = {
  presets: boolean;
};
type SetMapExpandedSectionsFn = (mapExpandedSections: MapExpandedSections) => void;

/**
 * From POISelector component
 */
type POIExpandedSections = {
  pois: boolean;
};
type SetPOIExpandedSectionsFn = (poiExpandedSections: POIExpandedSections) => void;

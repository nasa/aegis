/**
 * The mission object
 */
interface Mission {
  id: number;
  name: string;
  config: Config;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  landerLocation?: AEGISPoint;
  landerElevationMeters?: number;
  traverseSpeed?: number;
}

// No alteration needed to convert this store type to the database type
type Mission_db_type = Omit<Mission, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

/** AEGIS version of Config JSON object from MMGIS.
 * Contains all the same properties with the exception of Layers */
interface Config {
  msv: MMGIS_Msv;
  projection: MMGIS_Projection;
  look: MMGIS_Look;
  panels: string[];
  panelSettings: MMGIS_PanelSettings;
  tools: MMGIS_Tool[];
  //layers: LayerConfig[];
  time: MMGIS_ConfigTime;
}

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

interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
}

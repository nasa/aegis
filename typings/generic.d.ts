/**
 * The mission object
 */
interface Mission {
  id?: number;
  name: string;
  config: Config;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// No alteration needed to convert this store type to the database type
type Mission_db_type = Mission;

/** Config JSON object from MMGIS with the exception of Layers */
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

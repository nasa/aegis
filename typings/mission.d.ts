/**
 * The mission object
 */
interface Mission {
  id: number;
  name: string;
  description: string;
  missionBanner: string;
  config: Config;
  version: number;
  landerLocation: AEGISPoint;
  landerElevationMeters: number;
  planetRadius: number;
  initialZoom: number;
  traverseSpeed: number;
  sunAzimuth: number;
  earthAzimuth: number;
  sunAzimuthVisible: boolean;
  earthAzimuthVisible: boolean;
  defaultEvaDuration: number;
  walkbackSpeed: number;
  equipmentItems: EquipmentItem[];
  geographicUnits: GeographicUnit[];
  _metadata?: Metadata; // Meant for JsonExport file export only
  demFilePath: string;
  demResolution: number;
  projIsCustom: boolean;
  projEpsg: string;
  projProj4String: string;
  projBoundsMinX: number;
  projBoundsMinY: number;
  projBoundsMaxX: number;
  projBoundsMaxY: number;
  projOriginX: number;
  projOriginY: number;
  projResZoomLevel: number;
  projResUnitsPerPixel: number;
  createdAt?: string;
  updatedAt?: string;
  landerRadii: LanderRadius[];
}

// No alteration needed to convert this store type to the database type
type Mission_db_type = Omit<Mission, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

/** AEGIS version of Config JSON object from MMGIS.
 * Contains all the same properties with the exception of Layers */
interface Config {
  layers: (Omit<MMGIS_LayerConfig, "sublayers"> & { sublayers?: Sublayer[] })[]; //remove once layer config is dropped
  msv: MMGIS_Msv;
  projection: MMGIS_Projection;
  look: MMGIS_Look;
  panels: string[];
  panelSettings: MMGIS_PanelSettings;
  tools: MMGIS_Tool[];
  time: MMGIS_ConfigTime;
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

/**
 * Equipment item
 */
interface EquipmentItem {
  uuid: string;
  name: string;
  quantity: number;
  singleUse: boolean;
}

/**
 * Geographic unit
 */
interface GeographicUnit {
  uuid: string;
  name: string;
}
/*
 * Vector circles around lander
 */
type LanderRadius = {
  uuid: string;
  name: string;
  radius: number;
};

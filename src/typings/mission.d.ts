/**
 * The mission object
 */
interface Mission {
  id: number;
  name: string;
  description: string;
  missionBanner: string;
  version: number;
  landerLocation: AEGISPoint;
  landerElevationMeters: number;
  planetRadius: number;
  initialZoom: number;
  traverseRate: number;
  sunAzimuth: number;
  sunEnabled: boolean;
  earthAzimuth: number;
  earthEnabled: boolean;
  earthAsMoon: boolean;
  defaultEvaDuration: number;
  walkbackRate: number;
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
  actionTemplates: ActionTemplate[];
  stmLevel1Enabled?: boolean;
  stmLevel1Name?: string;
  stmLevel2Name?: string;
  stmLevel3Name?: string;
}

// No alteration needed to convert this store type to the database type
type Mission_db_type = Omit<Mission, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

type ActionTemplate = Partial<Action> & { templateName: string; uuid: string; type: string };

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

type EquipmentItemDisplay = {
  name: string;
  quantityUsed: number;
};

/**
 * Equipment needed to perform an action.
 */
type EquipmentItemUsage = {
  uuid: string;
  quantityUsed: number;
};

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

type MissionHomepageItem = {
  id: number;
  name: string;
  runningRex: Rex;
};

type OneMissionToRuleThemAll = {
  mission: Mission;
  actions: Action[];
  evas: Eva[];
  layers: Layer[];
  pois: Poi[];
  presets: Preset[];
  rexes: Rex[];
  stations: Station[];
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  sublayers: Sublayer[];
  traverses: Traverse[];
};

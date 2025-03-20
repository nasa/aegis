/**
 * The mission object
 */
interface Mission {
  id: number;
  name: string;
  description: string | null;
  missionBanner: string | null;
  version: number;
  isArchived: boolean;
  actionSystemVersion: number;
  actionDefinitions: ActionDefinitions | null;
  landerLocation: AEGISPoint;
  landerElevationMeters: number | null;
  planetRadius: number | null;
  initialZoom: number | null;
  traverseRate: number | null;
  defaultEvaDuration: number | null;
  walkbackRate: number | null;
  equipmentItems: EquipmentItem[] | null;
  geographicUnits: GeographicUnit[] | null;
  activeGridUuid: string | null;
  _metadata?: string; // Meant for JsonExport file export only
  demFilePath: string;
  demResolution: number | null;
  projIsCustom: boolean;
  projEpsg: string;
  projProj4String: string;
  projBoundsMinX: number | null;
  projBoundsMinY: number | null;
  projBoundsMaxX: number | null;
  projBoundsMaxY: number | null;
  projOriginX: number | null;
  projOriginY: number | null;
  projResZoomLevel: number | null;
  projResUnitsPerPixel: number | null;
  createdAt?: string;
  updatedAt?: string;
  circleDefinitions: CircleDefinition[] | null;
  actionTemplates: ActionTemplate[] | null;
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

type ActionDefinitionType = "verbs" | "nouns" | "adjectives";

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
  size: number;
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
  abbr?: string;
}
/*
 * Vector circles around lander or stations
 */
type CircleDefinition = {
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
  pois: POI[];
  presets: Preset[];
  rexes: Rex[];
  stations: Station[];
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  stmRules: STMRule[];
  sublayers: Sublayer[];
  traverses: Traverse[];
};

type MissionGrid = {
  gridInformation: MissionGridInformation;
  coordinates: MissionGridPoint[][];
};

type MissionGridInformation = {
  uuid: string;
  missionId: number;
  numRows: number;
  numCols: number;
  spacing: number;
  name: string;
  isActiveGrid: boolean;
};

type Grid_db_type = Omit<MissionGridInformation, "missionId">;

type MissionGridPoint = {
  id: number;
  index: GridIndex;
  coordinates: AEGISPoint;
  name?: string;
};

type GridIndex = {
  row: number;
  col: number;
};

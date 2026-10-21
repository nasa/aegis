/**
 * The mission object
 */
interface Mission {
  id: number | null;
  name: string;
  description: string | null;
  maestroDocId: string | null;
  missionBanner: string | null;
  usingLGRSCoordinates: boolean;
  gridRenderMode: GridRenderMode;
  actionSystemVersion: number;
  actionDefinitions: ActionDefinitions | null;
  landerLocation: AEGISPoint;
  landerElevationMeters: number | null;
  planetRadius: number | null;
  initialZoom: number | null;
  traverseRate: number | null;
  defaultEvaDuration: number | null;
  walkbackRate: number | null;
  equipmentItems: EquipmentItems | null;
  geographicUnits: GeographicUnits | null;
  missionPriorities: MissionPriorities | null;
  serverFileGrid: MissionGridDefinition | null;
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
  circleDefinitions: CircleDefinitions | null;
  reportCampaigns: { [uuid: string]: ReportCampaign } | null;
  actionTemplates: ActionTemplates | null;
  stmLevel1Enabled?: boolean;
  stmLevel1Name?: string;
  stmLevel2Name?: string;
  stmLevel3Name?: string;
  // Custom labels for the action-definition categories (verb/noun/adjective), in singular form
  // (used in the action sentence) and plural form (used in headings/menus).
  actionDefinitionLabels: ActionDefinitionLabels;
  // Custom conjunctions joining the action sentence "<verb> of <noun> in <adjective>".
  actionDefinitionConjunctions: {
    verbToNoun: string;
    nounToAdjective: string;
  };
  pois: { [uuid: string]: POI };
  actions: { [uuid: string]: Action };
  stations: { [uuid: string]: Station };
  traverses: { [uuid: string]: Traverse };
  evas: { [uuid: string]: Eva };
  rexes: { [uuid: string]: Rex };
  folders: { [uuid: string]: Folder };
  layers: { [uuid: string]: Layer };
  sublayers: { [uuid: string]: Sublayer };
  presets: { [uuid: string]: Preset };
  stmLevel1s: { [uuid: string]: STMLevel1 };
  stmLevel2s: { [uuid: string]: STMLevel2 };
  stmLevel3s: { [uuid: string]: STMLevel3 };
  stmRules: { [uuid: string]: STMRule };
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

type ActionDefinitionType = "verbs" | "nouns" | "adjectives";

type ActionTemplates = {
  [uuid: string]: ActionTemplate;
};

// Explicitly omit all of the fields from Action that should not be an actionTemplate
type ActionTemplate = Omit<
  Action,
  | "uuid"
  | "refUuid"
  | "poiUuid"
  | "stationUuid"
  | "traverseUuid"
  | "parentActionUuid"
  | "parentCopyDate"
  | "location"
  | "elevation"
  | "enabled"
> & {
  templateName: string | null;
};

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
type EquipmentItems = {
  [uuid: string]: EquipmentItem;
};
type EquipmentItem = {
  name: string;
  quantity: number;
  singleUse: boolean;
};

type EquipmentItemDisplay = {
  name: string;
  quantityUsed: number;
};

/**
 * Equipment needed to perform an action.
 */
type EquipmentItemUsages = {
  [uuid: string]: {
    quantityUsed: number;
  };
};

/**
 * Geographic unit
 */
type GeographicUnits = {
  [uuid: string]: GeographicUnit;
};
type GeographicUnit = {
  name: string;
  abbr?: string;
};

/**
 * Mission priorities. A flat map of trace rows; the `category` string on each row is what
 * groups them in the UI. A category exists only for as long as at least one row carries it.
 */
type MissionPriorities = {
  [uuid: string]: MissionPriority;
};
type MissionPriority = {
  trace: string; // identifier ex: SIMD-0005.1
  category: string; // task name
};

/*
 * Vector circles around lander or stations
 */
type CircleDefinitions = {
  [uuid: string]: CircleDefinition;
};
type CircleDefinition = {
  name: string;
  radius: number;
};

interface ReportCampaign {
  uuid: string;
  name: string;
  description: string | null;
  memberEvaUuids: string[];
  executionRexUuidByEvaUuid: { [evaUuid: string]: string } | null;
  createdAt: number;
  updatedAt: number | null;
}

type MissionHomepageItem = {
  id: number;
  name: string;
  runningRex: RunningRexSummary | null;
};

type RunningRexSummary = Pick<
  Rex,
  "uuid" | "name" | "petRunning" | "petStartStopTimestamp" | "petValueAtStartStop"
>;

type MissionSummary = Pick<
  Mission,
  "id" | "name" | "archivedAt" | "actionSystemVersion" | "createdAt"
> & {
  runningRex: RunningRexSummary | null;
};

type OneMissionToRuleThemAll = {
  mission: Mission;
};

type MissionGrid = {
  gridDefinition: MissionGridDefinition;
  coordinates: MissionGridPoint[][];
};

type GridRenderMode = "server-file" | "dynamic-lgrs";

type ResolvedMissionGrid =
  { kind: "none" } | { kind: "dynamic-lgrs" } | { kind: "server-file"; grid: MissionGrid };

/**
 * Grid metadata stored on the mission Automerge doc (`mission.serverFileGrid`).
 * There is exactly one grid per mission; the coordinate array lives on disk
 * (Data/<fileName>) and is loaded into `globalGrid` at runtime.
 */
type MissionGridDefinition = {
  numRows: number;
  numCols: number;
  name: string;
  fileName: string; // on-disk coordinate file in the mission Data/ folder
};

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

interface MissionCopyOptions {
  nameSuffix: string;
  copyAssets?: boolean;
}

type MissionDuplicationProgress = {
  type: "progress";
  message: string;
  elapsedSeconds: number;
};

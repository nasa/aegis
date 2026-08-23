interface Eva {
  uuid: string;
  refUuid: string; // assigned on creation and is preserved when duplication for a rex
  missionId: number;

  name: string;
  status: EVAStatus;
  /**
   * Does not include ingress/egress location. Starts/ends with a traverse item
   */
  sequence: EvaSequenceItem[];
  description: string;
  duration: number | null; // minutes
  traverseRate: number | null; // km/h
  egressDuration: number | null; // minutes
  ingressDuration: number | null; // minutes
  egressLocationUuid: string; // station uuid or "lander"
  ingressLocationUuid: string; // station uuid or "lander"
  traverseColor: string | null;
  ownerId: number;
  datetime: number | null;

  createdAt?: number;
  updatedAt?: number;
}

type Eva_db_type = Omit<Eva, "createdAt" | "updatedAt" | "datetime"> & {
  createdAt?: Date;
  updatedAt?: Date;
  datetime: string; // DB column stores as varchar; migration.ts converts to number | null for Automerge
};

type EVAStatus = "Archived" | "Candidate" | "In Review" | "Approved";

type TraverseStatus = "Archived" | "Candidate" | "In Review" | "Approved";

interface Traverse {
  uuid: string;
  refUuid: string; // assigned on creation and is preserved when duplication for a rex
  missionId: number;
  actionOrderUuids: string[] | null;

  name: string;
  status: TraverseStatus | null;
  path: AEGISPoint[] | null;
  pathSegmentDistances: number[] | null; //meters
  pathSegmentElevations: number[][] | null; //meters
  pathSegmentAbsoluteSlopes?: (number | null)[][] | null; //degrees
  duration: number | null; //minutes
  description: string;
  traverseRate?: number | null; // km/h
  color?: string | null;

  createdAt?: number;
  updatedAt?: number;
}

type Traverse_db_type = Omit<Traverse, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

interface EvaSequenceItem {
  type: "station" | "traverse";
  uuid: string;
}

interface Station {
  uuid: string;
  refUuid: string; // assigned on creation and is preserved when duplication for a rex

  ownerId: number;
  missionId: number;
  poiUuids?: string[];
  actionOrderUuids: string[];

  name: string;
  status: StationStatus;
  description: string;
  radius: number;
  location: AEGISPoint | null;
  elevation: number | null;
  walkbackPath: AEGISPoint[] | null;
  walkbackPathSegmentDistances: number[] | null; //meters
  walkbackPathSegmentElevations: number[][] | null; //meters
  walkbackTraverseRate: number | null; // km/h
  icon: string | null;
  mapCircleControls: MapCircleControls;

  /**
   * The estimated duration of the action, in minutes.
   */
  duration: number | null; // in minutes

  createdAt?: number;
  updatedAt?: number;
}

type Station_db_type = Omit<Station, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

type StationStatus = "Archived" | "Candidate" | "In Review" | "Approved";

/**
 * A POI is a point of interest that has been placed on the map, and chosen as a possible target to be visited as part of an EVA.
 */
interface POI {
  /**
   * uuid of the POI
   */
  uuid: string;
  ownerId: number;
  missionId: number;
  actionOrderUuids: string[];

  /**
   * The name of the POI, e.g. "M-19"
   */
  name: string;

  /**
   * The description of the POI, e.g. "Mare Crisium"
   */
  description: string;

  /**
   * Priority of this POI.
   */
  priorityOverride: number;

  /**
   * The radius of this POI. (how close to the POI is considered "at" the POI)
   */
  radius: number;

  /**
   * The coordinates or series of coordinates of the POI.
   */
  location: AEGISPoint | null;
  elevation: number | null;

  /**
   * The emoji of this POI
   */
  icon: string;

  /**
   * Tags for this POI
   */
  tags: string[];

  /**
   * Status of this POI
   */
  status: POIStatus | null;

  createdAt: number;
  updatedAt: number;
}

// TODO remove me when the POI postgres table is removed
type Poi_db_type = Omit<POI, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

type POIStatus = "Archived" | "Candidate" | "In Review" | "Approved";

type StmPriorities = {
  [uuid: string]: number; // key is the uuid of the STM level
};

/**
 * Action to be taken by crew on the surface (photograph, describe, take sample, etc)
 */
type Action = {
  /**
   * uuid of the action
   */
  uuid: string;
  refUuid: string; // assigned on creation and is preserved when duplication for a rex
  name: string;

  missionId: number | null;
  poiUuid?: string | null;
  stationUuid?: string | null;
  traverseUuid?: string | null;

  parentActionUuid?: string | null; // the poi action uuid it was copied from
  parentCopyDate?: number | null;

  priority: number | null; // 1-10
  /**
   * Allow linkage to any part of the STM hierarchy
   */
  stmPriorities: StmPriorities | null; // the priority of each STM selected for this action (L/M/H)
  /**
   * The type of action to be taken
   */
  type: ActionType;
  /**
   * Science explanation of details of the action. e.g. "Photograph contact point between two units."
   */
  description: string;
  /**
   * Task description for the crew.
   */
  descriptionTask: string | null;

  // Action system v2 types
  stmAction: boolean;
  actionDefinition: ActionDefinition | null;
  //

  /**
   * The duration of the action, in minutes.
   */
  icon: string | null;
  /**
   * The coordinates or series of coordinates of the Action.
   */
  location: AEGISPoint | null;
  elevation: number | null;
  duration: number | null; // in minutes
  equipmentItemsUsage: EquipmentItemUsages | null; // Equipment needed to perform this action.
  geographicUnitsUsage: string[] | null; // uuids of geographic units used in this action
  mass: number | null; // grams
  status: ActionStatus | null;
  enabled: boolean;
  crewAssigned: Crew[];
  createdAt: number;
  updatedAt: number;
};

type Action_db_type = Omit<
  Action,
  "poiUuid" | "stationUuid" | "parentActionUuid" | "traverseUuid"
> & {
  poi: Poi_db_type;
  station: Station_db_type;
  traverse: Traverse_db_type;
  parentAction: Action_db_type;
};

type ActionStatus = "Archived" | "Candidate" | "In Review" | "Approved";
type ActionParentType = "station" | "poi" | "traverse";
type Crew = "EV1" | "EV2";

// Filter options when getting actions from the API endpoint
interface ActionFilterOptions {
  missionId?: number;
  actionUuid?: string;
  poiUuid?: string;
  stationUuid?: string;
}

// Contains parent uuid types for Action
type ActionParentUuid = {
  poiUuid?: string;
  stationUuid?: string;
  traverseUuid?: string;
};

type ActionHighlight = {
  uuid: string;
  highlight: boolean;
};

type ActionType =
  | "measurement"
  | "observation"
  | "sample"
  | "photo"
  | "other"
  | "drive tube"
  | "double drive tube"
  | "scoop"
  | "sealed scoop"
  | "trench"
  | "rake"
  | "float"
  | "chip";

// Action V2 types
type ActionDefinitionItem = { name: string; abbr: string };
type ActionDefinitionItems = { [uuid: string]: ActionDefinitionItem };

// Used in the Mission structure
// The full list of noun/verb/adj
type ActionDefinitions = {
  verbs: ActionDefinitionItems;
  nouns: ActionDefinitionItems;
  adjectives: ActionDefinitionItems;
};

// Used in the Action structure
// A single noun/verb/adj for a given action
type ActionDefinition = {
  verbUuid?: string;
  nounUuid?: string;
  adjectiveUuid?: string;
};

type TotalAscentDescentObj = {
  totalMetersClimbed: number;
  totalMetersDescended: number;
};

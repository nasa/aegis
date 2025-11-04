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
  traverseColor: string;
  ownerId: number;
  datetime: string;
  showEditWarning: boolean;
  editWarningMsg: string;

  createdAt?: string;
  updatedAt?: string;
}

type Eva_db_type = Omit<Eva, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
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
  duration: number | null; //minutes
  description: string;
  traverseRate?: number | null; // km/h
  color?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

type Traverse_db_type = Omit<Traverse, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
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

  createdAt?: string;
  updatedAt?: string;
}

type Station_db_type = Omit<Station, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
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

  createdAt?: string;
  updatedAt?: string;
}

type Poi_db_type = Omit<POI, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
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
  parentCopyDate?: string | null;

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
  descriptionTask: string;

  // Action system v2 types
  stmAction: boolean;
  actionDefinition: ActionDefinition | null;
  //

  /**
   * The duration of the action, in minutes.
   */
  icon: string;
  /**
   * The coordinates or series of coordinates of the Action.
   */
  location: AEGISPoint | null;
  elevation: number | null;
  duration: number | null; // in minutes
  equipmentItemsUsage: EquipmentItemUsage[] | null; // Equipment needed to perform this action.
  geographicUnitsUsage: string[] | null; // uuids of geographic units used in this action
  mass: number; // grams
  status: ActionStatus | null;
  enabled: boolean;
  crewAssigned: Crew[];
  createdAt?: string;
  updatedAt?: string | undefined;
};

type Action_db_type = Omit<
  Action,
  "missionId" | "poiUuid" | "stationUuid" | "createdAt" | "updatedAt" | "parentCopyDate"
> & {
  mission: Mission_db_type;
  poi: Poi_db_type;
  station: Station_db_type;
  parentAction: Action_db_type;
  parentCopyDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
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

type ActionDefinitionItem = {
  uuid: string;
  name: string;
  abbr: string;
};

// used in the Mission structure
type ActionDefinitions = {
  verbs: ActionDefinitionItem[];
  nouns: ActionDefinitionItem[];
  adjectives: ActionDefinitionItem[];
};

// used in the Action structure
type ActionDefinition = {
  verbUuid: string;
  nounUuid: string;
  adjectiveUuid: string;
};

type TotalAscentDescentObj = {
  totalMetersClimbed: number;
  totalMetersDescended: number;
};

/**
 * Itinerary hierarchy. Traverses can have POIs too, but these would be limited to things that don't require a stopover.
 *
 * 1. Itinerary A (e.g. EVA 1)
 *    1. Station A (e.g. EVA 1A)
 *       a. POI A (e.g. M-19)
 *          1. Action A (e.g. M-19A)
 *          2. Action B (e.g. M-19B)
 *       b. POI B
 *       c. POI C
 *       d. Action C (e.g. EVA 1A-C)
 *    2. Traverse A (e.g. EVA 1-2)
 *       a. POI (e.g. M-20
 *         1. Action A (e.g. M-20A)
 * 2. Itinerary B
 *    1. ...
 */

interface Eva {
  uuid: string;
  ownerId: number;
  missionId: number;

  name: string;
  status: EVAStatus;
  sequence: EvaSequenceItem[];
  description: string;
  maxDuration: number; // minutes
  traverseRate: number; // km/hour

  egressDuration: number; // minutes
  ingressDuration: number; // minutes
  egressLocationUuid: string; // station uuid or "lander"
  ingressLocationUuid: string; // station uuid or "lander"

  createdAt?: string;
  updatedAt?: string;
}

type Eva_db_type = Omit<Eva, "ownerId" | "missionId" | "createdAt" | "updatedAt"> & {
  owner: User_db_type;
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type EVAStatus = "Archived" | "Candidate" | "In Review" | "Approved";

type EvaRexEvent = {
  uuid: string;
  creationDate: string;
};
type RexCrewType = Crew | "Cart";

interface CrewPos {
  uuid: string;
  location: AEGISPoint;
  elevation: number;
  seconds: number;
  crew: RexCrewType[];
  createdAt: string;
  updatedAt: string;
}

type TraverseStatus = "Archived" | "Candidate" | "In Review" | "Approved";

interface Traverse {
  uuid: string;
  missionId: number;

  name: string;
  status: TraverseStatus;
  path: AEGISPoint[];
  pathSegmentDistances: number[]; //meters
  pathSegmentElevations: number[][]; //meters
  predictedDurationLower: number; //minutes
  predictedDurationUpper: number; //minutes
  description: string;
  traverseRate?: number; // km/hour

  rexStatus: RexStatus;

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

  ownerId: number;
  missionId: number;
  poiUuids?: string[];
  actionOrderUuids: string[];

  name: string;
  status: StationStatus;
  description: string;
  radius: number;
  location: AEGISPoint;
  elevation: number;
  walkbackPath: AEGISPoint[];
  walkbackPathSegmentDistances: number[]; //meters
  walkbackPathSegmentElevations: number[][]; //meters
  icon: string;

  /**
   * The estimated duration of the action, in minutes.
   */
  durationLower: number; // in minutes
  durationUpper?: number; // in minutes

  rexStatus: RexStatus;

  createdAt?: string;
  updatedAt?: string;
}

type Station_db_type = Omit<Station, "ownerId" | "missionId" | "createdAt" | "updatedAt"> & {
  owner: User_db_type;
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
  location: AEGISPoint;
  elevation: number;

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
  status: POIStatus;

  createdAt?: string;
  updatedAt?: string;
}

type Poi_db_type = Omit<POI, "ownerId" | "missionId" | "createdAt" | "updatedAt"> & {
  owner: User_db_type;
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type POIStatus = "Archived" | "Candidate" | "In Review" | "Approved";

/**
 * Action to be taken by crew on the surface (photograph, describe, take sample, etc)
 */
type Action = {
  /**
   * uuid of the action
   */
  uuid: string;
  name: string;

  missionId: number;
  poiUuid?: string;
  stationUuid?: string;

  parentActionUuid?: string;
  parentCopyDate?: string;

  priority: number; // 1-10
  /**
   * Allow linkage to any part of the STM hierarchy
   */
  stmUuidRefs?: string[];
  /**
   * The type of action to be taken
   */
  type: ActionType;
  /**
   * Science explanation of details of the action. e.g. "Photograph contact point between two units."
   */
  description: string;
  /**
   * The duration of the action, in minutes.
   */
  icon: string;
  /**
   * The coordinates or series of coordinates of the Action.
   */
  location: AEGISPoint | null;
  elevation: number | null;
  durationLower: number; // in minutes
  durationUpper?: number; // in minutes
  equipmentItemsUsage: EquipmentItemUsage[]; // Equipment needed to perform this action.
  geographicUnitsUsage: string[]; // uuids of geographic units used in this action
  mass: number; // grams
  status: ActionStatus;
  enabled: boolean;
  crewAssigned: Crew[];
  rexStatus: RexStatus;
  createdAt?: string;
  updatedAt?: string;
};

type RexStatus = "pending" | "in-progress" | "complete" | "skipped";

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

type Crew = "EV1" | "EV2";

//Filter options when getting actions from the API endpoint
interface ActionFilterOptions {
  missionId?: number;
  actionUuid?: string;
  poiUuid?: string;
  stationUuid?: string;
}

//Contians both parent uuid types for Action
type ActionParentUuid = {
  poiUuid?: string;
  stationUuid?: string;
};

type ActionHighlight = {
  uuid: string;
  highlight: boolean;
};

type ActionType = "measurement" | "observation" | "sample" | "photo" | "other";

// used for display of time ranges
type TotalTimeObj = {
  durationLower: number;
  durationUpper: number;
};

type TotalAscentDescentObj = {
  totalMetersClimbed: number;
  totalMetersDescended: number;
};

type Rex = {
  missionId: number;
  uuid: string;
  name: string;
  description: string;
  petStartStopTimestamp: string; // the timestamp the play/pause button was clicked
  petValueAtStartStop: string; // the value of the pet timer when the play/pause button was clicked in "+hh:mm:ss"
  petRunning: boolean; // whether the timer is currently running
  selectedRexEvaUuid: string;
  rexRunning: boolean;
  crewPos: CrewPos[];
  createdAt?: string;
  updatedAt?: string;
};

type Rex_db_type = Omit<Rex, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type LogType =
  | "missionUpsert"
  | "missionDelete"
  | "presetUpsert"
  | "presetDelete"
  | "poiUpsert"
  | "poiDelete"
  | "stationUpsert"
  | "stationDelete"
  | "traverseUpsert"
  | "traverseDelete"
  | "actionUpsert"
  | "actionDelete"
  | "evaUpsert"
  | "evaDelete"
  | "rexUpsert"
  | "rexDelete"
  | "fullRexStart"
  | "fullRexStop";

type Log = {
  uuid: string;
  missionId: number;
  type: LogType;

  payloadJson: string;
  createdAt: string;
};

type Log_db_type = Omit<Log, "missionId" | "createdAt"> & {
  mission: Mission_db_type;
  createdAt: Date;
};

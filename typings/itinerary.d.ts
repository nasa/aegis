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

type TraverseStatus = "Archived" | "Candidate" | "In Review" | "Approved";

interface Traverse {
  uuid: string;
  missionId: number;

  name: string;
  status: TraverseStatus;
  path: AEGISPoint[];
  pathSegmentDistances: number[]; //meters
  pathSegmentElevations: number[][]; //meters
  elevationResolutionMeters: number;
  durationLower: number; //minutes
  durationUpper: number; //minutes
  description: string;

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
  actionOrderUuids?: string[];

  name: string;
  status: StationStatus;
  description: string;
  radius: number;
  location: AEGISPoint;
  walkbackPath: AEGISPoint[];
  walkbackPathSegmentDistances: number[]; //meters
  icon: string;

  /**
   * The estimated duration of the action, in minutes.
   */
  durationLower: number; // in minutes
  durationUpper?: number; // in minutes

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
  actionOrderUuids?: string[];

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
  /**
   * Priority normally inferred by STM relationship, but can be overridden.
   */
  priorityOverride: number; // 2.7

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
  durationLower: number; // in minutes
  durationUpper?: number; // in minutes

  // Inventory of items needed to perform this action.
  inventoryItems: InventoryItem[];

  status: ActionStatus;
  createdAt?: string;
  updatedAt?: string;
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

//Filter options when getting actions from the API endpoint
interface ActionFilterOptions {
  missionId?: number;
  actionUuid?: string;
  poiUuid?: string;
  stationUuid?: string;
}

//Action wrapper to track highlighted states in the action panels
interface WrappedAction {
  action: Action;
  highlight: boolean;
}

/**
 * Inventory item needed to perform an action.
 * Inventory management and tracking still being defined.
 */
type InventoryItem = {
  name: string;
  quantity: number;
};

type ActionType = "measurement" | "observation" | "sample" | "photo" | "other";

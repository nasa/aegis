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
 *    2. Traverse A (e.g. EVA 1-2)
 *       a. POI (e.g. M-20
 *         1. Action A (e.g. M-20A)
 * 2. Itinerary B
 *    1. ...
 */

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

  createdAt?: string;
  updatedAt?: string;
}

type Station_db_type = Omit<
  Station,
  "ownerId" | "missionId" | "location" | "createdAt" | "updatedAt"
> & {
  location: AEGISPoint | AEGISPoint[];
  owner: User;
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
   * The color of this POI
   */
  color: POIColor;

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

type Poi_db_type = Omit<POI, "ownerId" | "missionId" | "location" | "createdAt" | "updatedAt"> & {
  location: AEGISPoint | AEGISPoint[];
  owner: User;
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type POIColor = {
  value: string;
  label: string;
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

  status: POIStatus;
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

interface ActionFilterOptions {
  missionId?: number;
  actionUuid?: string;
  poiUuid?: string;
  stationUuid?: string;
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

type TraverseActivityPrototype = ActivityPrototypeEntity & {
  /**
   * type guard to differentiate from GeologyStation and standard Maestro activities
   * */
  type: "PlanetaryTraverse";

  /**
   * Should this be `Point[]` (just basic points) or `DrawingNote[]` to encourage annotations and
   * at the points? Could even make it `(DrawingNote | DrawingAction)[]` to allow actions to be
   * performed at the points, e.g. "At the crest of the hill, take a panorama".
   */
  path: AEGISPoint[]; // or make the point array allow annotations?

  /* some method to reference layers/views/hazards/etc */
};

/**
 * This is extending the Maestro concept of an "activity prototype"
 * It is a collection of points of interest that have been placed on the map, and chosen as targets to be visited as part of a station's activites.
 */
type GeologyStationActivityPrototype = ActivityPrototypeEntity & {
  /**
   * type guard to differentiate from PlanetaryTraverse and standard Maestro activities
   * */
  type: "GeologyStation";

  /**
   * Point to be used to traverse to/from
   */
  centroid: AEGISPoint;

  /**
   * Set of points defining polygon of the station
   */
  area?: AEGISPoint[];

  /**
   * Set of targets of interest that have been selected for this station
   */
  pois: POI[];

  /**
   * define an array of traverses to take to walk back. This may be the set of traverses going
   * forward/backward on the planned route, or it may be new traverses cutting straight back to
   * the lander.
   */
  walkback: TraverseActivityPrototype[];

  /* some method to reference layers/views/hazards/etc */
};

/**
 * Grouping of Locations and Traverses, creating an "itinerary" aka EVA aka Procedure aka Timeline.
 * Calling it "Itinerary" here just to deconflict terminology for now while we figure out what we're
 * building, so as not to confuse with "Maestro Procedures/Timelines" and the generic concept of EVA
 */
type Itinerary = {
  owner: string; // ejmontal
  name: string; // EVA 2
  scheduledStart: Date; // UTC

  /**
   * Should be [Location,Traverse,Location,Traverse], never [Location,Location,Traverse]. Also
   * should support point-to-point (first and last location not the same) and circuit.
   */
  sites: (GeologyStationActivityPrototype | TraverseActivityPrototype)[];
};

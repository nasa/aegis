/** How much of an executed REX's EVA may be edited. */
type RexExecuteEditMode = "unrestricted" | "limited" | "none";

/**
 * Bookkeeping captured the first time a REX is executed. Its presence also
 * means `executeEditMode` is frozen. The arrays and letter map are only
 * populated under `limited`; the other two modes store an empty state purely
 * to record that execution has happened.
 */
type RexExecuteEditState = {
  /** Stations created in the REX EVA under limited editing. */
  addedStationUuids: string[];
  /** Traverses created in the REX EVA under limited editing. */
  addedTraverseUuids: string[];
  /** Actions created under limited editing. */
  addedActionUuids: string[];
  /**
   * Station/traverse uuid -> the action uuid order each action's displayed
   * letter is derived from. Captured at first execution; reordering the live
   * list does not change it. Parents in `addedStationUuids` /
   * `addedTraverseUuids` have no entry here and render positionally.
   */
  actionLetterOrderByParent: { [parentUuid: string]: string[] };
};

type Rex = {
  missionId: number;
  uuid: string;
  ownerId: number;
  name: string;
  description: string;
  petStartStopTimestamp: string | null; // the timestamp the play/pause button was clicked
  petValueAtStartStop: string; // the value of the pet timer when the play/pause button was clicked in "+hh:mm:ss"
  petRunning: boolean; // whether the timer is currently running
  evaUuid: string;
  isRunning: boolean;
  posEntries: PosEntry[] | null;
  posTypes: PosType[];
  posSources: PosSource[];
  stationEntries: ActivityEntries | null;
  traverseEntries: ActivityEntries | null;
  actionEntries: ActionEntries | null;
  maestroControlled: boolean;
  maestroEventId: string | null;
  maestroEventUrl: string | null;
  maestroActivityProperties: MaestroActivityProperties | null;
  /** Chosen before execution, frozen once the REX has been executed. */
  executeEditMode: RexExecuteEditMode;
  /** Null until the REX is first executed. */
  executeEditState: RexExecuteEditState | null;
  createdAt?: number;
  updatedAt?: number;
};

/**
 * A REX plus every legacy field that has been removed from `Rex` but still
 * exists as a `rex_db` column and on docs that predate the migration that
 * strips it.
 *
 * - `xgressEntries` — egress/ingress REX status from before egress/ingress
 *   became real stations. Now folded into `stationEntries` keyed by the real
 *   xgress station uuid.
 * - `maestroActivityPropertiesByRefUuid` — activity display properties from
 *   before Maestro addressed activities by AEGIS uuid. Now
 *   `maestroActivityProperties`, keyed by uuid.
 *
 * The Automerge migration script seeds these from the DB, converts them onto
 * their replacements, then deletes them.
 */
type RexWithLegacyFields = Rex & {
  xgressEntries?: { [role: string]: { rexStatus: RexStatus } } | null;
  maestroActivityPropertiesByRefUuid?: { [refUuid: string]: MaestroActivityProperty } | null;
};

/**
 * The derelict `rex_db` table never received the field renames, so it has the
 * legacy columns and none of their replacements.
 */
type Rex_db_type = Omit<
  RexWithLegacyFields,
  | "createdAt"
  | "updatedAt"
  | "maestroActivityProperties"
  // The legacy Postgres `rex` table has no columns for the execute-edit fields.
  | "executeEditMode"
  | "executeEditState"
> & {
  createdAt?: Date;
  updatedAt?: Date;
};

interface PosSource {
  uuid: string;
  name: string;
  abbr: string;
}

interface PosEntry {
  uuid: string;
  location: AEGISPoint;
  elevation: number | null;
  petSeconds: number;
  posTypeUuids: string[];
  posSourceUuid: string;
  createdAt: number;
  updatedAt: number;
}

interface PosType {
  uuid: string;
  abbr: string;
  name: string;
  icon: string;
  pathColor: string;
}

type RexStatus = "pending" | "in-progress" | "complete" | "skipped";
interface ActivityEntry {
  rexStatus: RexStatus;
  maestroPercentCompleteEv1?: number;
  maestroPercentCompleteEv2?: number;
}

interface ActivityEntries {
  [stationOrTraverseUuid: string]: ActivityEntry; // "activity" is Station or Traverse
}

interface MaestroActivityProperty {
  color?: string | null; // hex color for the activity
  number?: string | null; // string of the activity number in the maestro procedure
}

interface MaestroActivityProperties {
  [uuid: string]: MaestroActivityProperty;
}

interface ActionEntry {
  rexStatus: RexStatus | null;
  mass?: number | null;
  markerId?: string | null;
  containerId?: string | null;
  secondaryContainerId?: string | null;
}

interface ActionEntries {
  [actionUuid: string]: ActionEntry;
}

/** Each distinct thing that `limited` mode permits across the REX EVA. */
type EvaEditCapability =
  | "activityDuration" // station, traverse, and xgress-station duration
  | "stationLocation" // location, elevation, and walkback traverse rate
  | "traversePath"
  | "evaSequenceAdd" // Add Station (creates a station slot + traverse)
  | "evaSequenceReorder" // up/down arrows
  | "evaSequenceRemove" // trash icon (removes a station and its following traverse)
  | "actionCreate"
  | "actionReorder" // drag-and-drop writing actionOrderUuids
  | "actionCrewAssigned"
  | "actionEnabled" // Activate/Deactivate in the kabob
  | "sampleCollectionIds"
  | "executedSampleMass";

/**
 * The per-action edit permissions threaded through the action tree. Bundled
 * rather than passed as separate booleans because every level forwards them.
 */
type ActionEditCapabilities = {
  crewAssigned: boolean;
  enabled: boolean;
  sampleIds: boolean;
  executedMass: boolean;
  reorder: boolean;
  /** name, type, priority, duration, planned mass, equipment, geo units, STM */
  generalFields: boolean;
  /** delete, duplicate, save-as-template */
  destructive: boolean;
};

/** How much of a running REX's EVA may be edited. */
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
  maestroActivityPropertiesByRefUuid: MaestroActivityPropertiesByRefUuid | null;
  /** Chosen before execution, frozen once the REX has been executed. */
  executeEditMode: RexExecuteEditMode;
  /** Null until the REX is first executed. */
  executeEditState: RexExecuteEditState | null;
  createdAt?: number;
  updatedAt?: number;
};

// The legacy Postgres `rex` table has no columns for the execute-edit fields.
type Rex_db_type = Omit<Rex, "createdAt" | "updatedAt" | "executeEditMode" | "executeEditState"> & {
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

interface MaestroActivityPropertiesByRefUuid {
  [refUuid: string]: MaestroActivityProperty;
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

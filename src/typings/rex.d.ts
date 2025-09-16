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
  xgressEntries: XgressEntries | null;
  maestroControlled: boolean;
  maestroEventId: string | null;
  maestroEventUrl: string | null;
  maestroActivityPropertiesByRefUuid: MaestroActivityPropertiesByRefUuid | null;
  createdAt?: string;
  updatedAt?: string;
};

type Rex_db_type = Omit<Rex, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
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
  elevation: number;
  petSeconds: number;
  posTypeUuids: string[];
  posSourceUuid: string;
  createdAt: string;
  updatedAt: string;
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
  rexStatus: RexStatus;
  mass?: number;
  markerId?: string;
  containerId?: string;
  secondaryContainerId?: string;
}

interface ActionEntries {
  [actionUuid: string]: ActionEntry;
}

interface XgressEntry {
  rexStatus: RexStatus;
}

interface XgressEntries {
  [xgressUuid: string]: XgressEntry;
}

// properties from REX that maestro should include in /rexOverwrite endpoint
type RexOverwrite = Pick<
  Rex,
  | "uuid"
  | "petStartStopTimestamp"
  | "petValueAtStartStop"
  | "petRunning"
  | "isRunning"
  | "xgressEntries"
  | "maestroControlled"
  | "maestroEventId"
  | "maestroEventUrl"
  | "maestroActivityPropertiesByRefUuid"
> & {
  stationEntriesByRefUuid: { [stationOrTraverseRefUuid: string]: ActivityEntry } | null;
  traverseEntriesByRefUuid: { [stationOrTraverseRefUuid: string]: ActivityEntry } | null;
  actionEntriesByRefUuid: { [actionRefUuid: string]: ActionEntry } | null;
};

type RexStatus = "pending" | "in-progress" | "complete" | "skipped";

type Rex = {
  missionId: number;
  uuid: string;
  ownerId: number;
  name: string;
  description: string;
  petStartStopTimestamp: string; // the timestamp the play/pause button was clicked
  petValueAtStartStop: string; // the value of the pet timer when the play/pause button was clicked in "+hh:mm:ss"
  petRunning: boolean; // whether the timer is currently running
  evaUuid: string;
  isRunning: boolean;
  posEntries: PosEntry[];
  posTypes: PosType[];
  posSources: PosSource[];
  stationEntries: ActivityEntries;
  traverseEntries: ActivityEntries;
  actionEntries: ActionEntries;
  xgressEntries: XgressEntries | null;
  maestroControlled: boolean;
  maestroExecutionHash: string | null;
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

interface ActivityEntry {
  rexStatus: RexStatus;
  maestroPercentCompleteEv1?: number;
  maestroPercentCompleteEv2?: number;
}

interface ActivityEntries {
  [stationOrTraverseUuid: string]: ActivityEntry; // "activity" is Station or Traverse
}

interface MaestroActivityPropertyEntry {
  color: string; // hex color for the activity
  number: number; // number of the activity in the maestro procedure
}

interface MaestroActivityPropertiesByRefUuid {
  [refUuid: string]: MaestroActivityPropertyEntry;
}

interface MaestroActivityProperties {
  [uuid: string]: MaestroActivityPropertyEntry;
}

interface ActionEntry {
  rexStatus: RexStatus;
  mass: number;
  markerId: string;
  containerId: string;
  secondaryContainerId: string;
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

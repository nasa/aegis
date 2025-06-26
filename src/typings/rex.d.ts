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
  stationEntries: StationEntries;
  traverseEntries: TraverseEntries;
  actionEntries: ActionEntries;
  xgressEntries: XgressEntries | null;
  maestroControlled: boolean;
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

interface StationEntries {
  [stationUuid: string]: StationEntry;
}

interface StationEntry {
  rexStatus: RexStatus;
}

interface TraverseEntries {
  [traverseUuid: string]: TraverseEntry;
}

interface TraverseEntry {
  rexStatus: RexStatus;
}

interface ActionEntries {
  [actionUuid: string]: ActionEntry;
}

interface ActionEntry {
  rexStatus: RexStatus;
  mass: number;
}

interface XgressEntries {
  [xgressUuid: string]: XgressEntry;
}

interface XgressEntry {
  rexStatus: RexStatus;
}

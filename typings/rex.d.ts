type RexStatus = "pending" | "in-progress" | "complete" | "skipped";

type Rex = {
  missionId: number;
  uuid: string;
  name: string;
  description: string;
  petStartStopTimestamp: string; // the timestamp the play/pause button was clicked
  petValueAtStartStop: string; // the value of the pet timer when the play/pause button was clicked in "+hh:mm:ss"
  petRunning: boolean; // whether the timer is currently running
  evaUuid: string;
  isRunning: boolean;
  posEntries: PosEntry[];
  posTypes: PosType[];
  stationEntries: StationEntries;
  traverseEntries: TraverseEntries;
  actionEntries: ActionEntries;
  createdAt?: string;
  updatedAt?: string;
};

type Rex_db_type = Omit<Rex, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

interface PosEntry {
  uuid: string;
  location: AEGISPoint;
  elevation: number;
  seconds: number;
  posTypeUuids: string[];
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
  [stationUuid: string]: StationEntry[];
}

interface StationEntry {
  uuid: string;
  rexStatus: RexStatus;
  createdAt: string;
}

interface TraverseEntries {
  [traverseUuid: string]: TraverseEntry[];
}

interface TraverseEntry {
  uuid: string;
  rexStatus: RexStatus;
  createdAt: string;
}

interface ActionEntries {
  [actionUuid: string]: ActionEntry[];
}

interface ActionEntry {
  uuid: string;
  rexStatus: RexStatus;
  createdAt: string;
}

export class Rex_db implements Rex_db_type {
  uuid!: string;

  missionId!: number;

  name!: string;

  description!: string;

  petStartStopTimestamp: string;

  petValueAtStartStop: string;

  petRunning: boolean;

  evaUuid: string;

  isRunning: boolean;

  posEntries: PosEntry[];

  posTypes: PosType[];

  posSources: PosSource[];

  stationEntries: ActivityEntries;

  traverseEntries: ActivityEntries;

  actionEntries: ActionEntries;

  xgressEntries: XgressEntries;

  ownerId: number;

  maestroControlled: boolean;

  maestroEventId: string | null;

  maestroEventUrl: string | null;

  maestroActivityPropertiesByRefUuid: MaestroActivityPropertiesByRefUuid | null;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}

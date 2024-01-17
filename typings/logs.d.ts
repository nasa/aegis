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

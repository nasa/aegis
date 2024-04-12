export type ActionUpsertRequest = {
  socketId?: string;
  missionId?: number;
  log: boolean;
  actions: Action[];
};

// export type ActionDeleteRequest = {
//   socketId?: string;
//   missionId?: string;
//   log: boolean;
//   actionUuids: string[];
// }

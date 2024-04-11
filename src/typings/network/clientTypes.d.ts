type ActionUpsertRequest = {
  socketId?: string;
  missionId?: number;
  log: boolean;
  actions: Action[];
};

// type ActionDeleteRequest = {
//   socketId?: string;
//   missionId?: number;
//   log: boolean;
//   actionUuids: string[];
// }

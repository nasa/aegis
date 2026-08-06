// used in getMissions maestro route
export type MissionsWithEvas = {
  [missionId: number]: {
    missionName: string;
    missionActionSystemVersion: number;
    evas: {
      refUuid: string;
      evaName: string;
    }[];
  };
};

// used in getRexesByEvaRef maestro route
export type RefRex = {
  uuid: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isRunning: boolean;
};

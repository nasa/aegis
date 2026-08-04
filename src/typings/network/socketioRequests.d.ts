// used in api/v1/emss/getMissions route and maestro socket handler
type MissionsWithEvas = {
  [missionId: number]: {
    missionName: string;
    missionActionSystemVersion: number;
    evas: {
      refUuid: string;
      evaName: string;
    }[];
  };
};

// used in api/v1/emss/getRexesByEvaRef route and maestro socket handler
type RefRex = {
  uuid: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isRunning: boolean;
};

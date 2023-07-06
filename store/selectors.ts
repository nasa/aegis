import type { RootState } from "store";

export const selectPoiActions =
  (poiUuid: string) =>
  (state: RootState): Action[] =>
    state.action.actions.filter((storeAction: Action) => storeAction.poiUuid === poiUuid);

export const selectStationActions =
  (stationUuid: string) =>
  (state: RootState): Action[] =>
    state.action.actions.filter((storeAction: Action) => storeAction.stationUuid === stationUuid);

export const selectMissionId = (state: RootState): number | false => {
  const mission = state.mission.mission;
  if (mission) {
    return mission.id;
  } else {
    return false;
  }
};

export const hasEditPermissions =
  (missionId: number) =>
  (state: RootState): boolean => {
    //super admin always has permissions
    if (state.user.ironSessionData?.user.id === 1) return true;

    const permissionList: Permission[] = state.user.ironSessionData?.user.permissionList;
    return permissionList.find((permission) => permission.missionId === missionId)?.permissions
      .edit;
  };

import type { RootState } from "store";

export const selectPoiActions =
  (poiUuid: string) =>
  (state: RootState): Action[] =>
    state.action.actions.filter((storeAction: Action) => storeAction.poiUuid === poiUuid);

export const selectMissionId = (state: RootState): number | false => {
  const mission = state.mission.mission;
  if (mission) {
    return mission.id;
  } else {
    return false;
  }
};

import cloneDeep from "lodash/cloneDeep";

import type { AppDispatch } from "utils/useAppDispatch";
import type { RootState } from "store";
import { getMissionDocHandle, withMissionChange } from "client/automergeDocHandles";
import {
  applyCreateCircleDefinition,
  applyDeleteCircleDefinition,
} from "operations/apply/apply-mission-circleDefinition";
import { setAllPresetCirclesUIStates } from "store/preset";
import { setAllStationCirclesUIStates } from "store/station";

import appCreateAsyncThunk from "./thunkUtil";

/**
 * Recompute the Redux-only circle UI states (slider open/closed) for every
 * preset and station so their keys match the mission's current circle
 * definitions. Run after a mutation that adds or removes a circle
 * definition; does not touch the Automerge document.
 */
const syncCircleUIStatesWithMission = (dispatch: AppDispatch, getState: () => RootState): void => {
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return;

  const newPresetCirclesUIStates: CirclesUIStates = {};
  for (const preset of Object.values(mission.presets ?? {})) {
    const newPresetCircleUIStates: CircleUIStates =
      cloneDeep(getState().preset.presetCirclesUIStates[preset.uuid]) || {};
    for (const uuid of Object.keys(mission.circleDefinitions ?? {})) {
      if (!newPresetCircleUIStates[uuid])
        newPresetCircleUIStates[uuid] = { slidersSelected: false };
    }
    for (const uuid of Object.keys(newPresetCircleUIStates)) {
      if (!mission.circleDefinitions?.[uuid]) delete newPresetCircleUIStates[uuid];
    }
    newPresetCirclesUIStates[preset.uuid] = newPresetCircleUIStates;
  }
  dispatch(setAllPresetCirclesUIStates({ circlesUIStates: newPresetCirclesUIStates }));

  const newStationCirclesUIStates: CirclesUIStates = {};
  for (const station of Object.values(mission.stations ?? {})) {
    if (station.isLanderXgress) continue;
    const newStationCircleUIStates: CircleUIStates =
      cloneDeep(getState().station.stationCirclesUIStates[station.uuid]) || {};
    for (const uuid of Object.keys(mission.circleDefinitions ?? {})) {
      if (!newStationCircleUIStates[uuid])
        newStationCircleUIStates[uuid] = { slidersSelected: false };
    }
    for (const uuid of Object.keys(newStationCircleUIStates)) {
      if (!mission.circleDefinitions?.[uuid]) delete newStationCircleUIStates[uuid];
    }
    newStationCirclesUIStates[station.uuid] = newStationCircleUIStates;
  }
  dispatch(setAllStationCirclesUIStates({ circlesUIStates: newStationCirclesUIStates }));
};

/**
 * Create a new circle definition. `applyCreateCircleDefinition` also syncs
 * the new circle into every preset's and station's `mapCircleControls`, all
 * in the single `.change()` made here.
 */
export const thunkCreateCircleDefinition = appCreateAsyncThunk<void>(
  "circleDefinitionCreate",
  async (_, { dispatch, getState }) => {
    withMissionChange((m) => applyCreateCircleDefinition(m));
    syncCircleUIStatesWithMission(dispatch, getState);
  }
);

/**
 * Delete a circle definition. `applyDeleteCircleDefinition` also syncs the
 * removal out of every preset's and station's `mapCircleControls`, all in
 * the single `.change()` made here.
 */
export const thunkDeleteCircleDefinition = appCreateAsyncThunk<{ circleDefUuid: string }>(
  "circleDefinitionDelete",
  async ({ circleDefUuid }, { dispatch, getState }) => {
    withMissionChange((m) => applyDeleteCircleDefinition(m, { circleDefUuid }));
    syncCircleUIStatesWithMission(dispatch, getState);
  }
);

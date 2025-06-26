import appCreateAsyncThunk from "./thunkUtil";
import { RootState } from "store";
import { actionSlice } from "store/action";
import {
  evaSlice,
  upsertExpandedEvaUuids,
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
} from "store/eva";
import { poiSlice } from "store/poi";
import { rexSlice } from "store/rex";
import { setSelectedStationUuid, stationSlice } from "store/station";
import { traverseSlice } from "store/traverse";

import { obliterateState as actionObliterateState } from "store/action";
import { obliterateState as evaObliterateState } from "store/eva";
import { obliterateState as hoverObliterateState } from "store/hover";
import {
  expandActions,
  obliterateState as interfaceObliterateState,
  setSectionSelected,
} from "store/interface";
import { obliterateState as mapObliterateState } from "store/map";
import { obliterateState as missionObliterateState } from "store/mission";
import { obliterateState as poiObliterateState } from "store/poi";
import { obliterateState as presetObliterateState } from "store/preset";
import { obliterateState as rexObliterateState } from "store/rex";
import { obliterateState as stationObliterateState } from "store/station";
import { obliterateState as stmObliterateState } from "store/stm";
import { obliterateState as traverseObliterateState } from "store/traverse";
import { obliterateState as userObliterateState } from "store/user";
import { obliterateState as measurementObliterateState } from "store/measure";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";

export const thunkSelectEVASequenceItem = appCreateAsyncThunk<{
  sequenceItemUuid: string;
}>("cross/selectEVASequenceItem", async ({ sequenceItemUuid }, { dispatch, getState }) => {
  // Dispatch action to set the selected EVA sequence item UUID
  dispatch(evaSlice.actions.setSelectedEvaSequenceItemUuid(sequenceItemUuid));

  if (!sequenceItemUuid) return; // Exit if sequenceItemUuid is null

  const state = getState() as RootState;
  const selectedEva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
  const sequenceItem = selectedEva?.sequence.find((seqItem) => seqItem.uuid === sequenceItemUuid);

  if (sequenceItem?.type === "station") {
    dispatch(stationSlice.actions.setSelectedStationUuid(sequenceItemUuid));
  } else if (sequenceItem?.type === "traverse") {
    dispatch(traverseSlice.actions.setSelectedTraverseRightNavItem("info_panel"));
  }
});

// Thunk for obliteratePoi
export const thunkDeletePoiAndActionsFromStore = appCreateAsyncThunk<{ poiUuid: string }>(
  "cross/thunkDeletePoiAndActionsFromStore",
  async ({ poiUuid }, { dispatch, getState }) => {
    const actions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.poiUuid === poiUuid
    );
    dispatch(poiSlice.actions.deletePoiByUuid(poiUuid));
    dispatch(poiSlice.actions.setSelectedPoiUuid(null));
    dispatch(actionSlice.actions.deleteActionsByUuid(actions.map((action) => action.uuid)));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
  }
);
export const thunkObliterateEntireStore = appCreateAsyncThunk<void>(
  "cross/obliterateEntireStore",
  async (__, { dispatch }) => {
    // Dispatch actions to reset each slice to its initial state
    dispatch(actionObliterateState());
    dispatch(evaObliterateState());
    dispatch(hoverObliterateState());
    dispatch(interfaceObliterateState());
    dispatch(mapObliterateState());
    dispatch(missionObliterateState());
    dispatch(poiObliterateState());
    dispatch(presetObliterateState());
    dispatch(rexObliterateState());
    dispatch(stationObliterateState());
    dispatch(stmObliterateState());
    dispatch(traverseObliterateState());
    dispatch(userObliterateState());
    dispatch(measurementObliterateState());
  }
);

export const thunkClearAllMapSelections = appCreateAsyncThunk<void>(
  "cross/thunkClearAllSelections",
  async (_, { dispatch }) => {
    dispatch(poiSlice.actions.setSelectedPoiUuid(null));
    dispatch(stationSlice.actions.setSelectedStationUuid(null));
    dispatch(evaSlice.actions.setSelectedEvaSequenceItemUuid(null));
    dispatch(rexSlice.actions.setSelectedPosEntryUuid(null));
  }
);

export const thunkSelectEvaAction = appCreateAsyncThunk<{
  evaUuid: string | null;
  actionUuid: string | null;
}>("cross/selectEvaAction", async ({ evaUuid, actionUuid }, { dispatch, getState }) => {
  // Skip if either UUID is not provided
  if (!evaUuid || !actionUuid) return;

  // Validate UUIDs format (basic validation)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(evaUuid) || !uuidRegex.test(actionUuid)) {
    console.warn("Invalid UUID format provided for EVA or action");
    return;
  }

  const state = getState() as RootState;

  // Validate EVA exists in store
  const evaExists = state.eva.evas.some((eva) => eva.uuid === evaUuid);
  if (!evaExists) {
    console.warn(`EVA with UUID ${evaUuid} not found in store`);
    return;
  }
  // Validate action exists in store
  const actionExists = state.action.actions.some((action) => action.uuid === actionUuid);
  if (!actionExists) {
    console.warn(`Action with UUID ${actionUuid} not found in store`);
    return;
  }

  // go to eva section and select the eva
  dispatch(setSectionSelected("evas"));
  dispatch(setSelectedEvaUuid(evaUuid));
  // expand the eva
  const allRexEvas = state.rex.rexes.map((rex) => rex.evaUuid);
  const evaRefUuid = state.eva.evas.find((e) => e.uuid === evaUuid)?.refUuid;
  const asPlannedEva = state.eva.evas.find(
    (eva) => eva.refUuid === evaRefUuid && !allRexEvas.includes(eva.uuid)
  );
  dispatch(upsertExpandedEvaUuids([asPlannedEva?.uuid]));
  // select the action station
  const actionStationUuid = state.action.actions.find(
    (action) => action.uuid === actionUuid
  )?.stationUuid;
  dispatch(setSelectedStationUuid(actionStationUuid));
  // select the action panel and expand the specific action
  dispatch(setSelectedEvaRightNavItem("actions_panel"));
  dispatch(expandActions([actionUuid]));

  // if this a rex eva, also select the rex
  const rex = state.rex.rexes.find((rex) => rex.evaUuid === evaUuid);
  if (rex) {
    dispatch(rexSlice.actions.setSelectedRexUuid(rex.uuid));
    dispatch(
      evaSlice.actions.setEvaDropdownUIState({
        asPlannedEvaUuid: asPlannedEva?.uuid,
        dropdownEvaUuid: rex.evaUuid,
      })
    );
  }
});

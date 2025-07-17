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
import { stationSlice } from "store/station";

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
  }
});

// Thunk for obliteratePoi
export const thunkDeletePoiAndActionsFromStore = appCreateAsyncThunk<{ poiUuid: string }>(
  "cross/thunkDeletePoiAndActionsFromStore",
  async ({ poiUuid }, { dispatch, getState }) => {
    const actions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.poiUuid === poiUuid
    );
    dispatch(poiSlice.actions.deletePoisByUuid([poiUuid]));
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
    //dispatch(userObliterateState()); // do not remove user state.
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
  evaRefUuid: string;
  actionRefUuid: string;
  rexUuid: string | null;
}>(
  "cross/selectEvaAction",
  async ({ evaRefUuid, actionRefUuid, rexUuid }, { dispatch, getState }) => {
    // Skip if either UUID is not provided
    if (!evaRefUuid || !actionRefUuid) return;

    // Validate UUIDs format (basic validation)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(evaRefUuid) || !uuidRegex.test(actionRefUuid)) {
      console.warn("Deep link error: Invalid UUID format provided for EVA or action");
      return;
    }
    if (rexUuid && !uuidRegex.test(rexUuid)) {
      console.warn("Deep link error: Invalid UUID format provided for REX");
      return;
    }

    // Validate EVA exists in store
    const evaExists = getState().eva.evas.some((eva) => eva.refUuid === evaRefUuid);
    if (!evaExists) {
      console.warn(`Deep link error: EVA with refUUID ${evaRefUuid} not found in store`);
      return;
    }
    // Validate action exists in store
    const actionExists = getState().action.actions.some(
      (action) => action.refUuid === actionRefUuid
    );
    if (!actionExists) {
      console.warn(`Deep link error: Action with refUUID ${actionRefUuid} not found in store`);
      return;
    }
    // Validate REX exists in store if provided
    if (rexUuid) {
      const rexExists = getState().rex.rexes.some((rex) => rex.uuid === rexUuid);
      if (!rexExists) {
        console.warn(`Deep link error: REX with UUID ${rexUuid} not found in store`);
        return;
      }
    }

    // go to eva section
    dispatch(setSectionSelected("evas"));
    let eva: Eva = null;
    if (rexUuid) {
      // get rex's eva
      const evaUuid = getState().rex.rexes.find((rex) => rex.uuid === rexUuid)?.evaUuid;
      eva = getState().eva.evas.find((eva) => eva.refUuid === evaRefUuid && eva.uuid === evaUuid);

      // also select the rex
      dispatch(rexSlice.actions.setSelectedRexUuid(rexUuid));
      // get the as-planned EVA to set the dropdown state
      const asPlannedEva = getState().eva.evas.find(
        (eva) =>
          eva.refUuid === evaRefUuid &&
          !getState().rex.rexes.some((rex) => rex.evaUuid === eva.uuid)
      );
      dispatch(
        evaSlice.actions.setEvaDropdownUIState({
          asPlannedEvaUuid: asPlannedEva?.uuid,
          dropdownEvaUuid: evaUuid,
        })
      );
      // expand the as-planned eva
      dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
    } else {
      // get as-planned eva
      const allRexEvaUuids = getState().rex.rexes.map((rex) => rex.evaUuid);
      eva = getState().eva.evas.find(
        (eva) => eva.refUuid === evaRefUuid && !allRexEvaUuids.includes(eva.uuid)
      );
      // expand the eva
      dispatch(upsertExpandedEvaUuids([eva.uuid]));
    }
    // select the eva
    dispatch(setSelectedEvaUuid(eva.uuid));

    // get the action uuid by checking it against the eva's sequence items
    const sequenceItemUuids = eva.sequence.map((stationSeqItem) => stationSeqItem.uuid);
    const action = getState().action.actions.find(
      (action) =>
        action.refUuid === actionRefUuid &&
        (sequenceItemUuids.includes(action.stationUuid) ||
          sequenceItemUuids.includes(action.traverseUuid))
    );
    // select the action panel and expand the specific action
    dispatch(setSelectedEvaRightNavItem("actions_panel"));
    dispatch(expandActions([action.uuid]));
  }
);

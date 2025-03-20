import appCreateAsyncThunk from "./thunkUtil";
import { RootState } from "store";
import { actionSlice } from "store/action";
import {
  evaSlice,
  setExpandedEvaUuids,
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
} from "store/eva";
import { poiSlice } from "store/poi";
import { presetSlice } from "store/preset";
import { rexSlice } from "store/rex";
import { selectPoiActions } from "store/selectors";
import { stationSlice } from "store/station";
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
    dispatch(stationSlice.actions.setSelectedStationUuid(null));
  }
});

export const thunkSaveNewEva = appCreateAsyncThunk<{
  eva: Eva;
}>("cross/saveNewEva", async ({ eva }, { dispatch }) => {
  dispatch(evaSlice.actions.upsertEva(eva));
  dispatch(evaSlice.actions.setStateForNewEva({ uuid: eva.uuid }));
  dispatch(thunkSetRightPanelIsOpenIfAuto(true));
});

export const thunkSaveNewPoi = appCreateAsyncThunk<{ poi: POI }>(
  "cross/saveNewPoi",
  async ({ poi }, { dispatch }) => {
    dispatch(poiSlice.actions.upsertPoi(poi));
    dispatch(poiSlice.actions.setStateForNewPoi({ uuid: poi.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
);

// Assuming the relevant action creators are defined in the presetSlice and interfaceSlice
export const thunkSaveNewPreset = appCreateAsyncThunk<{
  preset: Preset;
}>("cross/saveNewPreset", async ({ preset }, { dispatch }) => {
  // Upsert the new preset
  dispatch(presetSlice.actions.upsertPreset(preset));

  // Set additional state related to the new preset
  dispatch(presetSlice.actions.setStateForNewPreset({ uuid: preset.uuid }));

  // Open the right panel
  dispatch(thunkSetRightPanelIsOpenIfAuto(true));
});

// Assuming the relevant action creators are defined in the stationSlice and interfaceSlice
export const thunkSaveNewStation = appCreateAsyncThunk<{
  station: Station;
}>("cross/saveNewStation", async ({ station }, { dispatch }) => {
  // Upsert the new station
  dispatch(stationSlice.actions.upsertStation(station));

  // Set additional state related to the new station
  dispatch(stationSlice.actions.setStateForNewStation({ uuid: station.uuid }));

  // Open the right panel
  dispatch(thunkSetRightPanelIsOpenIfAuto(true));
});

// Assuming the relevant action creators are defined in the rexSlice and interfaceSlice
export const thunkSaveNewRex = appCreateAsyncThunk<{
  rex: Rex;
}>("cross/saveNewRex", async ({ rex }, { dispatch }) => {
  // Upsert the new rex
  dispatch(rexSlice.actions.upsertRex(rex));

  // Set additional state related to the new rex
  dispatch(rexSlice.actions.setStateForNewRex({ rexUuid: rex.uuid }));
  dispatch(evaSlice.actions.setSelectedEvaUuid(null));

  // Open the right panel
  dispatch(thunkSetRightPanelIsOpenIfAuto(true));
});

// Thunk for obliteratePoi
export const thunkObliteratePoi = appCreateAsyncThunk<{ poiUuid: string }>(
  "cross/obliteratePoi",
  async ({ poiUuid }, { dispatch, getState }) => {
    const state = getState() as RootState;
    const actions = selectPoiActions(poiUuid)(state);
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

  // If both EVA and action exist, proceed with selection
  dispatch(setSectionSelected("evas"));
  dispatch(setSelectedEvaUuid(evaUuid));
  dispatch(setExpandedEvaUuids([evaUuid]));
  dispatch(setSelectedEvaRightNavItem("actions_panel"));
  dispatch(expandActions([actionUuid]));
});

import { AnyAction, PayloadAction, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "store";
import { stationSlice } from "./station";
import { poiSlice } from "./poi";
import { actionSlice } from "./action";
import { selectPoiActions } from "./selectors";
import { interfaceSlice } from "./interface";
import { evaSlice } from "./eva";
import { traverseSlice } from "./traverse";
import { initialState } from "../store";
import { presetSlice } from "./preset";
import { rexSlice } from "./rex";
import { missionSlice } from "./mission";
import { stmSlice } from "./stm";

export const crossSlice = createSlice({
  name: "cross-slice",
  // Initial = {} is fine, since this assumes slice reducers will initialize state
  initialState: {} as RootState,
  reducers: {
    selectEVASequenceItem(state, action: PayloadAction<{ sequenceItemUuid: string }>) {
      evaSlice.caseReducers.setSelectedEvaSequenceItemUuid(state.eva, {
        payload: action.payload.sequenceItemUuid,
      });
      //if we're just clearing the selection (pased in null), do not reset station selection
      if (!action.payload.sequenceItemUuid) return;

      //check if this sequence item is a station. If so, also select it in the station store
      const selectedEva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
      const sequenceItemType = selectedEva.sequence.find(
        (seqItem) => seqItem.uuid === action.payload.sequenceItemUuid
      )?.type;
      if (sequenceItemType === "station") {
        stationSlice.caseReducers.setSelectedStationUuid(state.station, {
          payload: action.payload.sequenceItemUuid,
        });
      } else if (sequenceItemType === "traverse") {
        traverseSlice.caseReducers.setSelectedTraverseRightNavItem(state.traverse, {
          payload: "info_panel",
        });
      }
    },

    saveNewEva: (state, action: { payload: Eva }) => {
      //upsert to store
      evaSlice.caseReducers.upsertEva(state.eva, {
        payload: action.payload,
      });
      //set all the states
      evaSlice.caseReducers.setStateForNewEva(state.eva, {
        payload: { uuid: action.payload.uuid },
      });
      //open right panel
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: true });
    },

    saveNewPoi: (state, action: { payload: POI }) => {
      //upsert to store
      poiSlice.caseReducers.upsertPoi(state.poi, {
        payload: action.payload,
      });
      //set all the states
      poiSlice.caseReducers.setStateForNewPoi(state.poi, {
        payload: { uuid: action.payload.uuid },
      });
      //open right panel
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: true });
    },

    saveNewPreset: (state, action: { payload: Preset }) => {
      //upsert to store
      presetSlice.caseReducers.upsertPreset(state.preset, {
        payload: action.payload,
      });
      //set all the states
      presetSlice.caseReducers.setStateForNewPreset(state.preset, {
        payload: { uuid: action.payload.uuid },
      });
      //open right panel
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: true });
    },

    saveNewStation: (state, action: { payload: Station }) => {
      //upsert to store
      stationSlice.caseReducers.upsertStation(state.station, {
        payload: action.payload,
      });
      //set all the states
      stationSlice.caseReducers.setStateForNewStation(state.station, {
        payload: { uuid: action.payload.uuid },
      });
      //open right panel
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: true });
    },

    saveNewRex: (state, action: { payload: Rex }) => {
      //upsert to store
      rexSlice.caseReducers.upsertRex(state.rex, {
        payload: action.payload,
      });
      //set all the states
      rexSlice.caseReducers.setStateForNewRex(state.rex, {
        payload: { rexUuid: action.payload.uuid },
      });
      //open right panel
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: true });
    },

    obliteratePoi(state, action: PayloadAction<{ poiUuid: string }>) {
      const poiUuid = action.payload.poiUuid;

      const actions = selectPoiActions(poiUuid)(state);

      poiSlice.caseReducers.deletePoiByUuid(state.poi, { payload: poiUuid });
      poiSlice.caseReducers.setSelectedPoiUuid(state.poi, { payload: null });
      actionSlice.caseReducers.deleteActionsByUuid(state.action, {
        payload: actions.map((action) => action.uuid),
      });
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: false });
    },
    obliterateEntireStore(state) {
      const newInitialState = {
        hover: initialState.hover,
        mission: initialState.mission,
        user: initialState.user,
        map: initialState.map,
        eva: initialState.eva,
        poi: initialState.poi,
        interface: initialState.interface,
        stm: initialState.stm,
        preset: initialState.preset,
        station: initialState.station,
        action: initialState.action,
        traverse: initialState.traverse,
      };

      Object.assign(state, newInitialState);
    },
    setRunningRexView(state, action: PayloadAction<{ runningRexUuid: string }>) {
      rexSlice.caseReducers.setSelectedRexUuid(state.rex, {
        payload: action.payload.runningRexUuid,
      });
      rexSlice.caseReducers.setExpandedRexUuids(state.rex, {
        payload: [action.payload.runningRexUuid],
      });
      evaSlice.caseReducers.setSelectedEvaRightNavItem(state.eva, {
        payload: "actions_panel",
      });
      interfaceSlice.caseReducers.setRightPanelOpen(state.interface, { payload: true });
      interfaceSlice.caseReducers.setSectionSelected(state.interface, { payload: "rex" });
      evaSlice.caseReducers.setSelectedEvaUuid(state.eva, {
        payload: state.rex.rexes.find((rex) => rex.uuid === action.payload.runningRexUuid).evaUuid,
      });
    },
    setAllStoreLoadingStatuses(state, action: PayloadAction<LoadingStatus>) {
      missionSlice.caseReducers.setMissionLoadingStatus(state.mission, { payload: action.payload });
      presetSlice.caseReducers.setPresetLoadingStatus(state.preset, { payload: action.payload });
      poiSlice.caseReducers.setPoiLoadingStatus(state.poi, { payload: action.payload });
      stationSlice.caseReducers.setStationLoadingStatus(state.station, { payload: action.payload });
      actionSlice.caseReducers.setActionLoadingStatus(state.action, { payload: action.payload });
      evaSlice.caseReducers.setEvaLoadingStatus(state.eva, { payload: action.payload });
      traverseSlice.caseReducers.setTraverseLoadingStatus(state.traverse, {
        payload: action.payload,
      });
      stmSlice.caseReducers.setStmLoadingStatus(state.stm, { payload: action.payload });
      rexSlice.caseReducers.setRexLoadingStatus(state.rex, { payload: action.payload });
    },
  },
  extraReducers: (builder) =>
    builder.addMatcher(isRejectedAction, (state, action) => {
      console.error("Rejected async thunk. Action = ", {
        action,
      });
    }),
});
interface RejectedAction extends Action {
  error: Error;
}

function isRejectedAction(action: AnyAction): action is RejectedAction {
  return action.type.endsWith("rejected");
}

export const {
  selectEVASequenceItem,
  saveNewEva,
  saveNewPoi,
  saveNewPreset,
  saveNewStation,
  saveNewRex,
  obliteratePoi,
  obliterateEntireStore,
  setRunningRexView,
  setAllStoreLoadingStatuses,
} = crossSlice.actions;

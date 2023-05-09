import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "store";
import { stationSlice } from "./station";
import { poiSlice } from "./poi";
import { actionSlice } from "./action";
import { selectPoiActions } from "./selectors";
import { interfaceSlice } from "./interface";
import { evaSlice } from "./eva";
import { traverseSlice } from "./traverse";
import { initialState } from "../store";

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
      ).type;
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
      // everything except user
      const newInitialState = {
        playhead: initialState.playhead,
        playheadHover: initialState.playheadHover,
        mission: initialState.mission,
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
  },
});

export const { selectEVASequenceItem, obliteratePoi, obliterateEntireStore } = crossSlice.actions;

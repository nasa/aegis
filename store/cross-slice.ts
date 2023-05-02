import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "store";
import { poiSlice } from "./poi";
import { actionSlice } from "./action";
import { selectPoiActions } from "./selectors";
import { interfaceSlice } from "./interface";
import { initialState } from "../store";

export const crossSlice = createSlice({
  name: "cross-slice",
  // Initial = {} is fine, since this assumes slice reducers will initialize state
  initialState: {} as RootState,
  reducers: {
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

export const { obliteratePoi, obliterateEntireStore } = crossSlice.actions;

import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "store";
import { poiSlice } from "./poi";
import { actionSlice } from "./action";
import { selectPoiActions } from "./selectors";
import { interfaceSlice } from "./interface";

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
  },
});

export const { obliteratePoi } = crossSlice.actions;

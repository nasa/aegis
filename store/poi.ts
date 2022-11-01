import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "utils/store";

export const initialState: PoiState = {
  pois: [],
  selectedPoiUuid: null,
};

export const poiSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    upsertPoi: (state, action: { payload: POI }) => {
      upsertByUuid(state.pois, action.payload);
    },
    upsertPois: (state, action: { payload: POI[] }) => {
      action.payload.forEach((poi) => upsertByUuid(state.pois, poi));
    },
  },
});

export const { upsertPoi, upsertPois } = poiSlice.actions;

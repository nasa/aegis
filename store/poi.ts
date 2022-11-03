import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "utils/store";

export const initialState: PoiState = {
  pois: [
    {
      uuid: "1",
      name: "POI Name 1",
      color: "#ff0000",
      description: "POI Description 1",
      actions: [],
      tags: [],
      location: {
        long: 0,
        lat: 0,
      },
      priorityOverride: 0,
      radius: 0,
      owner: "",
      status: "Candidate",
    },
    {
      uuid: "2",
      name: "POI Name 2",
      color: "#00ff00",
      description: "POI Description 2",
      actions: [],
      tags: [],
      location: {
        long: 0,
        lat: 0,
      },
      priorityOverride: 0,
      radius: 0,
      owner: "",
      status: "Candidate",
    },
  ],
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

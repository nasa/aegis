import { createSlice } from "@reduxjs/toolkit";

export const initialState: EvaState = {
  eva: {
    name: "EVA 1",
    evaItems: [
      { type: "station", name: "Lander", uuid: "sdf", position: null },
      { type: "traverse", name: "Traverse 1", uuid: "sdff", latLngsJSON: null },
      { type: "station", name: "Station 1", uuid: "ssdfds", position: null },
    ],
  },
};

export const evaSlice = createSlice({
  name: "eva",
  initialState,
  reducers: {
    appendEvaItem: (state, action: { payload: EvaItem }) => {
      state.eva.evaItems = [...state.eva.evaItems, action.payload];
    },
  },
});

export const { appendEvaItem } = evaSlice.actions;

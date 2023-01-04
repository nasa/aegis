import { createSlice } from "@reduxjs/toolkit";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "map_layer_selector",
};

export const interfaceSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    setSectionSelected: (
      state,
      action: { payload: "map_layer_selector" | "poi" | "station" | "eva_planner" }
    ) => {
      state.sectionSelectedLabel = action.payload;
    },
  },
});

export const { setSectionSelected } = interfaceSlice.actions;

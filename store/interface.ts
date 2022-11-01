import { createSlice } from "@reduxjs/toolkit";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "eva_planner",
};

export const interfaceSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    setSectionSelected: (
      state,
      action: { payload: "map_layer_selector" | "poi" | "eva_planner" }
    ) => {
      state.sectionSelectedLabel = action.payload;
    },
  },
});

export const { setSectionSelected } = interfaceSlice.actions;

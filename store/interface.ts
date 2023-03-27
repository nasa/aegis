import { createSlice } from "@reduxjs/toolkit";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "evas",
  rightPanelOpen: false,
};

export const interfaceSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    setSectionSelected: (state, action: { payload: InterfaceSection }) => {
      state.sectionSelectedLabel = action.payload;
    },
    setRightPanelOpen: (state, action: { payload: boolean }) => {
      state.rightPanelOpen = action.payload;
    },
  },
});

export const { setSectionSelected, setRightPanelOpen } = interfaceSlice.actions;

import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  layerControls: null,
  mousePosition: null,
  selectedRightNavItem: "information_panel",
  activeLayerName: null,
  activeLayerUUID: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
    },
    toggleLayerControlExpanded: (state, action: { payload: string }) => {
      state.layerControls[action.payload].expanded = !state.layerControls[action.payload].expanded;
    },
    toggleLayerControlEnabled: (state, action: { payload: string }) => {
      state.layerControls[action.payload].enabled = !state.layerControls[action.payload].enabled;
    },
    setLayerControlStyle: (
      state,
      action: { payload: { layerName: string; style: LayerControlStyle } }
    ) => {
      state.layerControls[action.payload.layerName].style = action.payload.style;
    },
    setSelectedRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setActiveLayerName: (state, action: { payload: string }) => {
      state.activeLayerName = action.payload;
    },
    setActiveLayerUUID: (state, action: { payload: string }) => {
      state.activeLayerUUID = action.payload;
    },
  },
});

export const {
  setLayerControls,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  setLayerControlStyle,
  setSelectedRightNavItem,
  setActiveLayerName,
  setActiveLayerUUID,
} = mapSlice.actions;

export default mapSlice.reducer;

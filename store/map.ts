import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  layerControls: null,
  mousePosition: null,
  selectedRightNavItem: "information_panel",
  activeLayerName: null,
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
    setLayerControlOpacity: (
      state,
      action: { payload: { layerName: string; opacity: number } }
    ) => {
      state.layerControls[action.payload.layerName].opacity = action.payload.opacity;
    },
    setSelectedRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setActiveLayerName: (state, action: { payload: string }) => {
      state.activeLayerName = action.payload;
    },
  },
});

export const {
  setLayerControls,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  setLayerControlOpacity,
  setSelectedRightNavItem,
  setActiveLayerName,
} = mapSlice.actions;

export default mapSlice.reducer;

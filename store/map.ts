import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  layerControls: null,
  mousePosition: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
    },
    setLayerOpacity: (state, action: { payload: { layerName: string; opacity: number } }) => {
      state.layerControls[action.payload.layerName].opacity = action.payload.opacity;
    },
    toggleLayerControlExpanded: (state, action: { payload: string }) => {
      state.layerControls[action.payload].expanded = !state.layerControls[action.payload].expanded;
    },
    toggleLayerControlEnabled: (state, action: { payload: string }) => {
      state.layerControls[action.payload].enabled = !state.layerControls[action.payload].enabled;
    },
  },
});

export const {
  setLayerControls,
  setLayerOpacity,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  // replaceAllDrawLayers,
} = mapSlice.actions;

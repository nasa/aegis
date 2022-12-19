import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  layerControls: null,
  activeSelectedName: null,
  mousePosition: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
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
    setActiveSelectedName: (state, action: { payload: string }) => {
      state.activeSelectedName = action.payload;
    },
  },
});

export const {
  setLayerControls,
  toggleLayerControlEnabled,
  setLayerControlStyle,
  setActiveSelectedName,
} = mapSlice.actions;

export default mapSlice.reducer;

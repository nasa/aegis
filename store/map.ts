import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  layerControls: null,
  activeSelectedName: null,
  mousePosition: null,
  mapDirective: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
    },
    updateMapDirective: (state, action: { payload: MapDirective }) => {
      state.mapDirective = action.payload;
    },
  },
});

export const { setLayerControls, updateMapDirective } = mapSlice.actions;

export default mapSlice.reducer;

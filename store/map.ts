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

    setActiveSelectedName: (state, action: { payload: string }) => {
      state.activeSelectedName = action.payload;
    },
    updateMapDirective: (state, action: { payload: MapDirective }) => {
      state.mapDirective = action.payload;
    },
  },
});

export const { setLayerControls, setActiveSelectedName, updateMapDirective } = mapSlice.actions;

export default mapSlice.reducer;

import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  mapLayerControls: null,
  activeSelectedName: null,
  mousePosition: null,
  mapDirective: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setMapLayerControls: (state, action: { payload: MapLayerControls }) => {
      state.mapLayerControls = action.payload;
    },
    updateMapDirective: (state, action: { payload: MapDirective }) => {
      state.mapDirective = action.payload;
    },
  },
});

export const { setMapLayerControls, updateMapDirective } = mapSlice.actions;

export default mapSlice.reducer;

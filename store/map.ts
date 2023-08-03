import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  mapSublayerControls: null,
  mapCircleControls: null,
  activeSelectedName: null,
  mousePosition: null,
  mapDirective: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setMapSublayerControls: (state, action: { payload: MapSublayerControls }) => {
      state.mapSublayerControls = action.payload;
    },
    setMapCircleControls: (state, action: { payload: MapCircleControls }) => {
      state.mapCircleControls = action.payload;
    },
    updateMapDirective: (state, action: { payload: MapDirective }) => {
      state.mapDirective = action.payload;
    },
  },
});

export const { setMapSublayerControls, setMapCircleControls, updateMapDirective } =
  mapSlice.actions;

export default mapSlice.reducer;

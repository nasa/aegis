import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  mapSublayerControls: null,
  mapCircleControls: null,
  activeSelectedName: null,
  mousePosition: null,
  mapDirective: null,
  measureInitialCoords: [],
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
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
    setMeasureInitialCoords: (state, action: { payload: AEGISPoint[] }) => {
      state.measureInitialCoords = action.payload;
    },
  },
});

export const {
  setMapSublayerControls,
  setMapCircleControls,
  updateMapDirective,
  obliterateState,
  setMeasureInitialCoords,
} = mapSlice.actions;

export default mapSlice.reducer;

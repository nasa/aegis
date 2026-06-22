import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "./crossActions";

export const initialState: MapState = {
  mapDirective: null,
  originalPoints: [],
  measureInitialCoords: [],
  gridCornerPoint: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    updateMapDirective: (state, action: { payload: MapDirective }) => {
      state.mapDirective = action.payload;
      // Also clear originalPoints
      if (action.payload === null) {
        state.originalPoints = [];
      }
    },
    setOriginalPoints: (state, action: { payload: AEGISPoint[] }) => {
      state.originalPoints = action.payload ?? [];
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
    setMeasureInitialCoords: (state, action: { payload: AEGISPoint[] }) => {
      state.measureInitialCoords = action.payload;
    },
    setGridCornerPoint: (state, action: { payload: MissionGridPoint }) => {
      state.gridCornerPoint = action.payload;
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.map);
    });
  },
});

export const {
  updateMapDirective,
  setOriginalPoints,
  obliterateState,
  setMeasureInitialCoords,
  setGridCornerPoint,
} = mapSlice.actions;

export default mapSlice.reducer;

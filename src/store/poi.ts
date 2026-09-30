import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: PoiState = {
  selectedPoiUuid: null,
  selectedRightNavItem: "info_panel",
};

export const poiSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    setSelectedPOIRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedPoiUuid: (state, action: { payload: string }) => {
      state.selectedPoiUuid = action.payload;
    },
    selectPoi: (state, action: { payload: { uuid: string } }) => {
      state.selectedPoiUuid = action.payload.uuid; // select the newly created POI
      state.selectedRightNavItem = "info_panel";
    },
    obliterateState: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.poi);
    });
  },
});

export const { setSelectedPOIRightNavItem, setSelectedPoiUuid, selectPoi, obliterateState } =
  poiSlice.actions;

import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: PoiState = {
  pois: [],
  poisFromDb: [],
  selectedPoiUuid: null,
  selectedRightNavItem: "info_panel",
  poisEditing: [],
};

export const poiSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    upsertPoi: (state, action: { payload: POI }) => {
      upsertToArrayByUuid(state.pois, action.payload);
    },
    upsertPois: (state, action: { payload: POI[] }) => {
      action.payload.forEach((poi) => upsertToArrayByUuid(state.pois, poi));
    },
    upsertPoisFromDb: (state, action: { payload: POI[] }) => {
      action.payload.forEach((poi) => upsertToArrayByUuid(state.poisFromDb, poi));
    },
    setPois: (state, action: { payload: POI[] }) => {
      state.pois = action.payload;
    },
    setPoisFromDb: (state, action: { payload: POI[] }) => {
      state.poisFromDb = action.payload;
    },
    deletePoi: (state, action: { payload: POI }) => {
      state.pois = state.pois.filter((poi) => poi.uuid !== action.payload.uuid);
    },
    deleteAllPois: (state) => {
      state.pois = [];
    },
    deleteAllPoisFromDb: (state) => {
      state.poisFromDb = [];
    },
    setSelectedPOIRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedPoiUuid: (state, action: { payload: string }) => {
      state.selectedPoiUuid = action.payload;
    },
    duplicatePoi: (state, action: { payload: POI }) => {
      state.pois.push(action.payload);
      // turn on edit mode for the new POI
      state.poisEditing.push(action.payload.uuid);
      // select the newly created POI
      state.selectedPoiUuid = action.payload.uuid;
    },
    setPoiEditMode: (state, action: { payload: { poiUuid: string; editMode: boolean } }) => {
      const poi = state.pois.find((poi) => poi.uuid === action.payload.poiUuid);
      if (poi) {
        if (action.payload.editMode) {
          state.poisEditing.push(poi.uuid);
        } else {
          state.poisEditing = state.poisEditing.filter((uuid) => uuid !== poi.uuid);
        }
      }
    },
    updatePoiLocation: (state, action: { payload: { uuid: string; location: AEGISPoint } }) => {
      state.pois = state.pois.map((poi) => {
        if (poi.uuid === action.payload.uuid) {
          return { ...poi, location: action.payload.location };
        }
        return poi;
      });
    },
  },
});

export const {
  upsertPoi,
  upsertPois,
  upsertPoisFromDb,
  setPois,
  setPoisFromDb,
  deletePoi,
  deleteAllPois,
  deleteAllPoisFromDb,
  setSelectedPOIRightNavItem,
  setSelectedPoiUuid,
  duplicatePoi,
  setPoiEditMode,
  updatePoiLocation,
} = poiSlice.actions;

import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";
import { v4 as uuidv4 } from "uuid";

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
    deletePoi: (state, action: { payload: POI }) => {
      state.pois = state.pois.filter((poi) => poi.uuid !== action.payload.uuid);
    },
    deleteAllPois: (state) => {
      state.pois = [];
    },
    deleteAllPoisFromDb: (state) => {
      state.poisFromDb = [];
    },
    setSelectedRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedPoiUuid: (state, action: { payload: string }) => {
      state.selectedPoiUuid = action.payload;
    },

    duplicatePoi: (state, action: { payload: POI }) => {
      const newPoi: POI = {
        ...action.payload,
        uuid: uuidv4(),
        name: action.payload.name + " (copy)",
      };
      state.pois.push(newPoi);
      // turn on edit mode for the new POI
      state.poisEditing.push(newPoi.uuid);
      // select the newly created POI
      state.selectedPoiUuid = newPoi.uuid;
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
  },
});

export const {
  upsertPoi,
  upsertPois,
  deletePoi,
  upsertPoisFromDb,
  deleteAllPois,
  deleteAllPoisFromDb,
  setSelectedRightNavItem,
  setSelectedPoiUuid,
  duplicatePoi,
  setPoiEditMode,
} = poiSlice.actions;

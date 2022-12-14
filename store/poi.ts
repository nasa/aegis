import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "utils/store";
import { v4 as uuidv4 } from "uuid";

export const initialState: PoiState = {
  pois: [],
  poisFromDb: [],
  selectedPoiUuid: null,
  selectedRightNavItem: "information_panel",
  poisEditing: [],
};

export const poiSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    upsertPoi: (state, action: { payload: POI }) => {
      upsertByUuid(state.pois, action.payload);
    },
    upsertPois: (state, action: { payload: POI[] }) => {
      action.payload.forEach((poi) => upsertByUuid(state.pois, poi));
    },
    upsertPoisFromDb: (state, action: { payload: POI[] }) => {
      action.payload.forEach((poi) => upsertByUuid(state.poisFromDb, poi));
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
    upsertAction: (state, action: { payload: { poi: POI; poiAction: Action } }) => {
      const poi = state.pois.find((poi) => poi.uuid === action.payload.poi.uuid);
      if (poi) {
        // upsert the action into the POI
        upsertByUuid(poi.actions, action.payload.poiAction);

        // upsert the POI into the state
        upsertByUuid(state.pois, poi);
      }
    },

    deleteAction: (state, action: { payload: { poi: POI; poiAction: Action } }) => {
      const poi = state.pois.find((poi) => poi.uuid === action.payload.poi.uuid);
      if (poi) {
        poi.actions = poi.actions.filter(
          (poiAction) => poiAction.uuid !== action.payload.poiAction.uuid
        );
      }
    },
    setPoiEditMode: (state, action: { payload: { poi: POI; editMode: boolean } }) => {
      const poi = state.pois.find((poi) => poi.uuid === action.payload.poi.uuid);
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
  upsertAction,
  deleteAction,
  setPoiEditMode,
} = poiSlice.actions;

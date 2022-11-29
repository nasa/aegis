import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "utils/store";
import { v4 } from "uuid";
import { uniqueNamesGenerator, animals, starWars } from "unique-names-generator";

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
    createBlankPoi: (state, action: { payload: { userId: number; missionId: number } }) => {
      const randomName: string = uniqueNamesGenerator({
        dictionaries: [animals],
        style: "capital",
      });

      const blankPoi: POI = {
        owner: action.payload.userId,
        mission: action.payload.missionId,
        uuid: v4(),
        name: "POI " + randomName,
        description: "",
        actions: [],
        priorityOverride: 0,
        radius: 5,
        location: null,
        color: null,
        tags: [],
        status: "Candidate",
      };
      state.pois.push(blankPoi);
      // turn on edit mode for the new POI
      state.poisEditing.push(blankPoi.uuid);
      // select the newly created POI
      state.selectedPoiUuid = blankPoi.uuid;
    },
    duplicatePoi: (state, action: { payload: POI }) => {
      const newPoi: POI = {
        ...action.payload,
        uuid: v4(),
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
    createBlankAction: (state, action: { payload: POI }) => {
      const randomName: string = uniqueNamesGenerator({
        dictionaries: [starWars],
        style: "capital",
      });

      const poi = state.pois.find((poi) => poi.uuid === action.payload.uuid);
      if (poi) {
        const blankAction: Action = {
          poi: poi.id,
          uuid: v4(),
          name: "Action " + randomName,
          description: "",
          status: "Candidate",
          type: "other",
          durationLower: 5,
          durationUpper: null,
          stmUuidRefs: null,
          inventoryItems: null,
        };
        poi.actions.push(blankAction);
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
    setEditMode: (state, action: { payload: { poi: POI; editMode: boolean } }) => {
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
  createBlankPoi,
  duplicatePoi,
  upsertAction,
  createBlankAction,
  deleteAction,
  setEditMode,
} = poiSlice.actions;

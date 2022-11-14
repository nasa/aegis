import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "utils/store";
import { v4 } from "uuid";
import { uniqueNamesGenerator, animals } from "unique-names-generator";

export const initialState: PoiState = {
  pois: [],
  poisFromDb: [],
  selectedPoiUuid: null,
  selectedRightNavItem: "information_panel",
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
    },
    duplicatePoi: (state, action: { payload: POI }) => {
      const newPoi: POI = {
        ...action.payload,
        uuid: v4(),
        name: action.payload.name + " (copy)",
      };
      state.pois.push(newPoi);
    },
  },
});

export const {
  upsertPoi,
  upsertPois,
  deletePoi,
  upsertPoisFromDb,
  setSelectedRightNavItem,
  setSelectedPoiUuid,
  createBlankPoi,
  duplicatePoi,
} = poiSlice.actions;

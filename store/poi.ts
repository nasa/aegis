import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: PoiState = {
  pois: [],
  poisFromDb: [],
  selectedPoiUuid: null,
  selectedRightNavItem: "info_panel",
  poisEditing: [],
  calculatedFields: [],
};

export const poiSlice = createSlice({
  name: "poi",
  initialState,
  reducers: {
    upsertPoi: (state, action: { payload: POI }) => {
      upsertToArrayByUuid(state.pois, action.payload);
    },
    setPois: (state, action: { payload: POI[] }) => {
      state.pois = action.payload;
    },
    setPoisFromDb: (state, action: { payload: POI[] }) => {
      state.poisFromDb = action.payload;
    },
    deletePoiByUuid: (state, action: { payload: string }) => {
      state.pois = state.pois.filter((poi) => poi.uuid !== action.payload);
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
    setPoiCalculatedFields: (
      state,
      action: { payload: { calculatedFields: PoiCalculatedFields[] } }
    ) => {
      state.calculatedFields = action.payload.calculatedFields;
    },
  },
});

export const {
  upsertPoi,
  setPois,
  setPoisFromDb,
  deletePoiByUuid,
  setSelectedPOIRightNavItem,
  setSelectedPoiUuid,
  duplicatePoi,
  setPoiEditMode,
  setPoiCalculatedFields,
} = poiSlice.actions;

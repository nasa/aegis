import { createSlice } from "@reduxjs/toolkit";
import { cloneDeep } from "lodash";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
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
    upsertPoi: {
      prepare: (poi: POI, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: poi };
        } else {
          return {
            payload: { ...poi, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
      reducer: (state, action: { payload: POI }) => {
        upsertToArrayByUuid(state.pois, action.payload);
      },
    },
    upsertPois: {
      prepare: (pois: POI[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: pois };
        } else {
          return {
            payload: pois.map((poi) => ({
              ...poi,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: POI[] }) => {
        action.payload.forEach((poi) => upsertToArrayByUuid(state.pois, poi));
      },
    },
    upsertPoisFromDb: (state, action: { payload: POI[] }) => {
      action.payload.forEach((poi) => upsertToArrayByUuid(state.poisFromDb, poi));
    },
    upsertPoiFromDb: (state, action: { payload: POI }) => {
      upsertToArrayByUuid(state.poisFromDb, action.payload);
    },
    upsertPoiByField: {
      prepare: (
        poiUuid: string,
        fieldName: keyof POI,
        value: POI[keyof POI],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { poiUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              poiUuid,
              fieldName,
              value,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: {
          payload: {
            poiUuid: string;
            fieldName: keyof POI;
            value: POI[keyof POI];
            updatedAt: string;
          };
        }
      ) => {
        const poi = state.pois.find((p) => p.uuid === action.payload.poiUuid);
        const newPoi: POI = cloneDeep(poi);
        newPoi.updatedAt = action.payload.updatedAt || poi.updatedAt;
        const key = action.payload.fieldName;
        (newPoi as Record<typeof key, POI[keyof POI]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.pois, newPoi);
      },
    },
    /* only called for populating store  */
    setPois: (state, action: { payload: POI[] }) => {
      state.pois = action.payload;
    },
    setPoisFromDb: (state, action: { payload: POI[] }) => {
      state.poisFromDb = action.payload;
    },
    deletePoiByUuid: (state, action: { payload: string }) => {
      state.pois = state.pois.filter((poi) => poi.uuid !== action.payload);
    },
    deletePoiFromDbByUuid: (state, action: { payload: string }) => {
      state.poisFromDb = state.poisFromDb.filter((poi) => poi.uuid !== action.payload);
    },
    deletePoisByUuid: (state, action: { payload: string[] }) => {
      state.pois = state.pois.filter((poi) => !action.payload.includes(poi.uuid));
    },
    deletePoisFromDbByUuid: (state, action: { payload: string[] }) => {
      state.poisFromDb = state.poisFromDb.filter((poi) => !action.payload.includes(poi.uuid));
    },
    setSelectedPOIRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedPoiUuid: (state, action: { payload: string }) => {
      state.selectedPoiUuid = action.payload;
    },
    setStateForNewPoi: (state, action: { payload: { uuid: string } }) => {
      state.poisEditing.push(action.payload.uuid); // turn on edit mode for the new POI
      state.selectedPoiUuid = action.payload.uuid; // select the newly created POI
      state.selectedRightNavItem = "info_panel";
    },
    setPoiEditMode: (state, action: { payload: { poiUuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        state.poisEditing.push(action.payload.poiUuid);
      } else {
        state.poisEditing = state.poisEditing.filter((uuid) => uuid !== action.payload.poiUuid);
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
  upsertPois,
  upsertPoisFromDb,
  upsertPoiFromDb,
  upsertPoiByField,
  setPois,
  setPoisFromDb,
  deletePoiByUuid,
  deletePoiFromDbByUuid,
  deletePoisByUuid,
  deletePoisFromDbByUuid,
  setSelectedPOIRightNavItem,
  setSelectedPoiUuid,
  setStateForNewPoi,
  setPoiEditMode,
  setPoiCalculatedFields,
} = poiSlice.actions;

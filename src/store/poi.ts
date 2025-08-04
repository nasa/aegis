import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { setAllSliceStores } from "store/crossActions";

import { getAccurateNow } from "utils/formatting";
import { upsertToArrayByUuid } from "store/storeUtils/store";

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
    upsertPois: {
      prepare: (pois: POI[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: pois };
        } else {
          return {
            payload: pois.map((poi) => ({
              ...poi,
              updatedAt: getAccurateNow().toISOString(),
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
              updatedAt: getAccurateNow().toISOString(),
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
    selectPoi: (state, action: { payload: { uuid: string } }) => {
      state.selectedPoiUuid = action.payload.uuid; // select the newly created POI
      state.selectedRightNavItem = "info_panel";
    },
    setPoiEditMode: (state, action: { payload: { poiUuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        if (!state.poisEditing.includes(action.payload.poiUuid)) {
          state.poisEditing.push(action.payload.poiUuid);
        }
      } else {
        state.poisEditing = state.poisEditing.filter((uuid) => uuid !== action.payload.poiUuid);
      }
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
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

export const {
  upsertPois,
  upsertPoisFromDb,
  upsertPoiByField,
  deletePoisByUuid,
  deletePoisFromDbByUuid,
  setSelectedPOIRightNavItem,
  setSelectedPoiUuid,
  selectPoi,
  setPoiEditMode,
  obliterateState,
} = poiSlice.actions;

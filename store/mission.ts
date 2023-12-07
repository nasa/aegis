import { createSlice } from "@reduxjs/toolkit";

import { getAccurateNow, roundDateToSecond } from "utils/formatting";

export const initialState: MissionState = {
  mission: null,
  missionFromDb: null,
  layers: null,
  sublayers: null,
  selectedRightNavItem: "prefs_panel",
  missionSectionsEditing: [],
  loadingStatus: "unloaded",
};

export const missionSlice = createSlice({
  name: "mission",
  initialState,
  reducers: {
    upsertMission: {
      prepare: (mission: Mission, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: mission };
        } else {
          return {
            payload: { ...mission, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
      reducer: (state, action: { payload: Mission }) => {
        state.mission = action.payload;
      },
    },
    upsertMissionByField: {
      prepare: (
        fieldName: keyof Mission,
        value: Mission[keyof Mission],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
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
            fieldName: keyof Mission;
            value: Mission[keyof Mission];
            updatedAt: string;
          };
        }
      ) => {
        state.mission.updatedAt = action.payload.updatedAt || state.mission.updatedAt;
        const key = action.payload.fieldName;
        (state.mission as Record<typeof key, Mission[keyof Mission]>)[key] = action.payload.value;
      },
    },

    /* only called for populating store  */
    setMission: (state, action: { payload: Mission }) => {
      state.mission = action.payload;
    },
    setMissionFromDb: (state, action: { payload: Mission }) => {
      state.missionFromDb = action.payload;
    },
    /* only called for populating store  */
    setLayers: (state, action: { payload: Layer[] }) => {
      state.layers = action.payload;
    },
    /* only called for populating store  */
    setSublayers: (state, action: { payload: Sublayer[] }) => {
      state.sublayers = action.payload;
    },
    setSelectedMissionRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setMissionSectionEditing: (
      state,
      action: { payload: { section: string; editMode: boolean } }
    ) => {
      if (action.payload.editMode) {
        state.missionSectionsEditing = [...state.missionSectionsEditing, action.payload.section];
      } else {
        state.missionSectionsEditing = state.missionSectionsEditing.filter(
          (section) => section !== action.payload.section
        );
      }
    },
    setMissionLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
  },
});

export const {
  upsertMission,
  upsertMissionByField,
  setMission,
  setMissionFromDb,
  setLayers,
  setSublayers,
  setSelectedMissionRightNavItem,
  setMissionSectionEditing,
  setMissionLoadingStatus,
} = missionSlice.actions;

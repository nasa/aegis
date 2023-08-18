import { createSlice } from "@reduxjs/toolkit";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

export const initialState: MissionState = {
  mission: null,
  missionFromDb: null,
  layers: null,
  sublayers: null,
  selectedRightNavItem: "prefs_panel",
  missionSectionsEditing: [],
};

export const missionSlice = createSlice({
  name: "mission",
  initialState,
  reducers: {
    upsertMission: {
      reducer: (state, action: { payload: Mission }) => {
        state.mission = action.payload;
      },
      prepare: (mission: Mission, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: mission };
        } else {
          return {
            payload: { ...mission, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
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
  },
});

export const {
  upsertMission,
  setMission,
  setMissionFromDb,
  setLayers,
  setSublayers,
  setSelectedMissionRightNavItem,
  setMissionSectionEditing,
} = missionSlice.actions;

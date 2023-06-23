import { createSlice } from "@reduxjs/toolkit";

export const initialState: MissionState = {
  mission: null,
  missionFromDb: null,
  layers: null,
  userInterface: null,
  selectedRightNavItem: "prefs_panel",
  missionSectionsEditing: [],
};

export const missionSlice = createSlice({
  name: "mission",
  initialState,
  reducers: {
    setMission: (state, action: { payload: Mission }) => {
      state.mission = action.payload;
    },
    setMissionFromDb: (state, action: { payload: Mission }) => {
      state.missionFromDb = action.payload;
    },
    setLayers: (state, action: { payload: Layer[] }) => {
      state.layers = action.payload;
    },
    setInterface: (state, action: { payload: UserInterface }) => {
      state.userInterface = action.payload;
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
  setMission,
  setMissionFromDb,
  setLayers,
  setInterface,
  setSelectedMissionRightNavItem,
  setMissionSectionEditing,
} = missionSlice.actions;

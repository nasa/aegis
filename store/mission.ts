import { createSlice } from "@reduxjs/toolkit";

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
    setMission: (state, action: { payload: Mission }) => {
      state.mission = action.payload;
    },
    setMissionFromDb: (state, action: { payload: Mission }) => {
      state.missionFromDb = action.payload;
    },
    setLayers: (state, action: { payload: Layer[] }) => {
      state.layers = action.payload;
    },
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
    upsertActionTemplate: (state, action: { payload: ActionTemplate }) => {
      const actionTemplates = state.mission.actionTemplates || [];
      const index = actionTemplates.findIndex((t) => t.uuid === action.payload.uuid);
      if (index >= 0) {
        actionTemplates[index] = action.payload;
      } else {
        actionTemplates.push(action.payload);
      }
      state.mission.actionTemplates = actionTemplates;
    },
    deleteActionTemplateByUuid: (state, action: { payload: string }) => {
      state.mission.actionTemplates.splice(
        state.mission.actionTemplates.findIndex((template) => template.uuid === action.payload),
        1
      );
    },
  },
});

export const {
  setMission,
  setMissionFromDb,
  setLayers,
  setSublayers,
  setSelectedMissionRightNavItem,
  setMissionSectionEditing,
  upsertActionTemplate,
  deleteActionTemplateByUuid,
} = missionSlice.actions;

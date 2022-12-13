import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "../utils/store";
import { v4 } from "uuid";
export const initialState: PresetState = {
  presets: [],
  presetsFromDB: [],
  selectedPresetUuid: null,
  selectedRightNavItem: null,
};

export const presetSlice = createSlice({
  name: "preset",
  initialState,
  reducers: {
    upsertPreset: (state, action: { payload: Preset }) => {
      upsertByUuid(state.presets, action.payload);
    },
    upsertPresets: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertByUuid(state.presets, preset));
    },
    upsertPresetsFromDB: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertByUuid(state.presetsFromDB, preset));
    },
    deletePreset: (state, action: { payload: Preset["uuid"] }) => {
      state.presets = state.presets.filter((preset) => preset.uuid !== action.payload);
    },
    createBlankPreset: (
      state,
      action: {
        payload: {
          userId: number;
          presetName: string;
          missionId: number;
          layerControls: LayerControls;
        };
      }
    ) => {
      const blankPreset: Preset = {
        uuid: v4(),
        description: "",
        name: action.payload.presetName,
        owner: action.payload.userId,
        mission: action.payload.missionId,
        layerControls: action.payload.layerControls,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.presets.push(blankPreset);
    },
    setSelectedPresetUuid: (state, action: { payload: string }) => {
      state.selectedPresetUuid = action.payload;
    },
    setSelectedRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
  },
});

export const {
  upsertPreset,
  upsertPresets,
  upsertPresetsFromDB,
  deletePreset,
  createBlankPreset,
  setSelectedPresetUuid,
  setSelectedRightNavItem,
} = presetSlice.actions;

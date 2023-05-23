import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "../utils/store";
import _ from "lodash";
export const initialState: PresetState = {
  presets: [],
  presetsFromDb: [],
  selectedPresetUuid: null,
  selectedRightNavItem: "info_panel",
  presetInteractions: {},
  presetsEditing: [],
};

export const presetSlice = createSlice({
  name: "preset",
  initialState,
  reducers: {
    upsertPreset: (state, action: { payload: Preset }) => {
      upsertToArrayByUuid(state.presets, action.payload);
    },
    upsertPresets: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertToArrayByUuid(state.presets, preset));
    },
    upsertPresetsFromDb: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertToArrayByUuid(state.presetsFromDb, preset));
    },
    setPresets: (state, action: { payload: Preset[] }) => {
      state.presets = action.payload;
    },
    setPresetsFromDb: (state, action: { payload: Preset[] }) => {
      state.presetsFromDb = action.payload;
    },
    deletePreset: (state, action: { payload: Preset }) => {
      state.presets = state.presets.filter((preset) => preset.uuid !== action.payload.uuid);
    },
    deleteAllPresetsFromDb: (state) => {
      state.presetsFromDb = [];
    },
    setSelectedPresetUuid: (state, action: { payload: string }) => {
      state.selectedPresetUuid = action.payload;
    },
    setSelectedPresetRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    togglePresetLayerControlEnabled: (
      state,
      action: { payload: { presetUuid: string; layerName: string } }
    ) => {
      const preset = state.presets.find((preset) => preset.uuid === action.payload.presetUuid);
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (preset) {
        preset.layerControls[action.payload.layerName].enabled =
          !preset.layerControls[action.payload.layerName].enabled;
      }
      state.presets[presetIndex] = preset;
    },
    setPresetLayerControlStyle: (
      state,
      action: { payload: { presetUuid: string; layerName: string; style: LayerControlStyle } }
    ) => {
      const preset = state.presets.find((preset) => preset.uuid === action.payload.presetUuid);
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (preset) {
        preset.layerControls[action.payload.layerName].style = action.payload.style;
      }
      state.presets[presetIndex] = preset;
    },
    togglePresetInteractionLayerExpanded: (
      state,
      action: { payload: { presetUuid: string; layerName: string } }
    ) => {
      if (!_.isNil(state.presetInteractions[action.payload.presetUuid][action.payload.layerName])) {
        state.presetInteractions[action.payload.presetUuid][action.payload.layerName].expanded =
          !state.presetInteractions[action.payload.presetUuid][action.payload.layerName].expanded;
      } else {
        state.presetInteractions[action.payload.presetUuid][action.payload.layerName] = {
          expanded: true,
          tabSelected: null,
        };
      }
    },
    setPresetInteractions: (
      state,
      action: {
        payload: {
          presetUuid: string;
          layerControlInteractions: LayerControlInteractions;
        };
      }
    ) => {
      state.presetInteractions[action.payload.presetUuid] = action.payload.layerControlInteractions;
    },
    setPresetInteraction: (
      state,
      action: {
        payload: {
          presetUuid: string;
          layerName: string;
          layerControlInteraction: LayerControlInteraction;
        };
      }
    ) => {
      state.presetInteractions[action.payload.presetUuid][action.payload.layerName] =
        action.payload.layerControlInteraction;
    },
    deletePresetInteractions: (state, action: { payload: { presetUuid: string } }) => {
      delete state.presetInteractions[action.payload.presetUuid];
    },
    setPresetEditMode: (state, action: { payload: { presetUuid: string; editMode: boolean } }) => {
      const preset = state.presets.find((preset) => preset.uuid === action.payload.presetUuid);
      if (preset) {
        if (action.payload.editMode) {
          state.presetsEditing.push(preset.uuid);
        } else {
          state.presetsEditing = state.presetsEditing.filter((uuid) => uuid !== preset.uuid);
        }
      }
    },
    resetAllPresetInteractions: (state, action: { payload: { presetUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.presetInteractions[action.payload.presetUuid]).forEach((layerName) => {
        state.presetInteractions[action.payload.presetUuid][layerName].tabSelected = null;
      });
    },
    duplicatePreset: (state, action: { payload: Preset }) => {
      state.presets.push(action.payload);
      // turn on edit mode for the new Preset
      state.presetsEditing.push(action.payload.uuid);
      // select the newly created Preset
      state.selectedPresetUuid = action.payload.uuid;
    },
  },
});

export const {
  upsertPreset,
  upsertPresets,
  upsertPresetsFromDb,
  setPresets,
  setPresetsFromDb,
  deletePreset,
  deleteAllPresetsFromDb,
  duplicatePreset,
  setSelectedPresetUuid,
  setSelectedPresetRightNavItem,
  togglePresetLayerControlEnabled,
  setPresetLayerControlStyle,
  togglePresetInteractionLayerExpanded,
  setPresetInteractions,
  setPresetInteraction,
  deletePresetInteractions,
  setPresetEditMode,
  resetAllPresetInteractions,
} = presetSlice.actions;

import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "../utils/store";
import { v4 as uuidv4 } from "uuid";
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
      upsertByUuid(state.presets, action.payload);
    },
    upsertPresets: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertByUuid(state.presets, preset));
    },
    upsertPresetsFromDb: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertByUuid(state.presetsFromDb, preset));
    },
    deletePreset: (state, action: { payload: Preset }) => {
      state.presets = state.presets.filter((preset) => preset.uuid !== action.payload.uuid);
    },
    deleteAllPresetsFromDb: (state) => {
      state.presetsFromDb = [];
    },
    duplicatePreset: (state, action: { payload: Preset }) => {
      const newPreset: Preset = {
        ...action.payload,
        uuid: uuidv4(),
        name: action.payload.name + " (copy)",
      };
      state.presets.push(newPreset);
      // turn on edit mode for the new preset
      state.presetsEditing.push(newPreset.uuid);
      // select the newly created POI
      state.selectedPresetUuid = newPreset.uuid;
    },
    setSelectedPresetUuid: (state, action: { payload: string }) => {
      state.selectedPresetUuid = action.payload;
    },
    setSelectedPresetRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setPresetLayerControl: (
      state,
      action: { payload: { presetUuid: string; layerName: string; layerControl: LayerControl } }
    ) => {
      const preset = state.presets.find((preset) => preset.uuid === action.payload.presetUuid);
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (preset) {
        preset.layerControls[action.payload.layerName] = action.payload.layerControl;
      }
      state.presets[presetIndex] = preset;
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
      state.presetInteractions[action.payload.presetUuid][action.payload.layerName].expanded =
        !state.presetInteractions[action.payload.presetUuid][action.payload.layerName].expanded;
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
  },
});

export const {
  upsertPreset,
  upsertPresets,
  upsertPresetsFromDb,
  deletePreset,
  deleteAllPresetsFromDb,
  duplicatePreset,
  setSelectedPresetUuid,
  setSelectedPresetRightNavItem,
  setPresetLayerControl,
  togglePresetLayerControlEnabled,
  setPresetLayerControlStyle,
  togglePresetInteractionLayerExpanded,
  setPresetInteractions,
  setPresetInteraction,
  deletePresetInteractions,
  setPresetEditMode,
} = presetSlice.actions;

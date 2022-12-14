import { createSlice } from "@reduxjs/toolkit";
import { upsertByUuid } from "../utils/store";
export const initialState: PresetState = {
  presets: [],
  presetsFromDB: [],
  selectedPresetUuid: null,
  selectedRightNavItem: null,
  presetInteractions: {},
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
    setSelectedPresetUuid: (state, action: { payload: string }) => {
      state.selectedPresetUuid = action.payload;
    },
    setSelectedRightNavItem: (state, action: { payload: string }) => {
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
  },
});

export const {
  upsertPreset,
  upsertPresets,
  upsertPresetsFromDB,
  deletePreset,
  setSelectedPresetUuid,
  setSelectedRightNavItem,
  setPresetLayerControl,
  togglePresetLayerControlEnabled,
  setPresetLayerControlStyle,
  togglePresetInteractionLayerExpanded,
  setPresetInteractions,
  setPresetInteraction,
  deletePresetInteractions,
} = presetSlice.actions;

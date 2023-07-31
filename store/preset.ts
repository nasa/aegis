import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "../utils/store";
import _ from "lodash";
export const initialState: PresetState = {
  presets: [],
  presetsFromDb: [],
  selectedPresetUuid: null,
  selectedRightNavItem: "info_panel",
  presetsUIStates: {},
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
    togglePresetLayerVisible: (
      state,
      action: { payload: { presetUuid: string; layerName: string } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapLayerControls[action.payload.layerName].visible =
          !state.presets[presetIndex].mapLayerControls[action.payload.layerName].visible;
      }
    },
    togglePresetCircleVisible: (
      state,
      action: { payload: { presetUuid: string; radiusUuid: string } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapCircleControls[action.payload.radiusUuid].visible =
          !state.presets[presetIndex].mapCircleControls[action.payload.radiusUuid].visible;
      }
    },
    setPresetLayerStyle: (
      state,
      action: { payload: { presetUuid: string; layerName: string; style: MapLayerStyle } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapLayerControls[action.payload.layerName].style =
          action.payload.style;
      }
    },
    setPresetCircleStyle: (
      state,
      action: { payload: { presetUuid: string; radiusUuid: string; style: MapLayerStyle } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapCircleControls[action.payload.radiusUuid].style =
          action.payload.style;
      }
    },
    togglePresetUIStateLayerExpanded: (
      state,
      action: { payload: { presetUuid: string; layerName: string } }
    ) => {
      if (!_.isNil(state.presetsUIStates[action.payload.presetUuid][action.payload.layerName])) {
        state.presetsUIStates[action.payload.presetUuid][action.payload.layerName].expanded =
          !state.presetsUIStates[action.payload.presetUuid][action.payload.layerName].expanded;
      } else {
        state.presetsUIStates[action.payload.presetUuid][action.payload.layerName] = {
          expanded: true,
          tabSelected: null,
        };
      }
    },
    setPresetUIStates: (
      state,
      action: {
        payload: {
          presetUuid: string;
          presetUIStates: PresetUIStates;
        };
      }
    ) => {
      state.presetsUIStates[action.payload.presetUuid] = action.payload.presetUIStates;
    },
    setPresetLayerUIState: (
      state,
      action: {
        payload: {
          presetUuid: string;
          layerName: string;
          presetLayerUIState: PresetLayerUIState;
        };
      }
    ) => {
      state.presetsUIStates[action.payload.presetUuid][action.payload.layerName] =
        action.payload.presetLayerUIState;
    },
    setPresetCircleUIState: (
      state,
      action: {
        payload: {
          presetUuid: string;
          radiusUuid: string;
          presetLayerUIState: PresetLayerUIState;
        };
      }
    ) => {
      state.presetsUIStates[action.payload.presetUuid][action.payload.radiusUuid] =
        action.payload.presetLayerUIState;
    },
    deletePresetUIStates: (state, action: { payload: { presetUuid: string } }) => {
      delete state.presetsUIStates[action.payload.presetUuid];
    },
    resetAllPresetUIStates: (state, action: { payload: { presetUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.presetsUIStates[action.payload.presetUuid]).forEach((layerName) => {
        state.presetsUIStates[action.payload.presetUuid][layerName].tabSelected = null;
      });
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
  togglePresetLayerVisible,
  togglePresetCircleVisible,
  setPresetLayerStyle,
  setPresetCircleStyle,
  togglePresetUIStateLayerExpanded,
  setPresetUIStates,
  setPresetLayerUIState,
  setPresetCircleUIState,
  deletePresetUIStates,
  setPresetEditMode,
  resetAllPresetUIStates,
} = presetSlice.actions;

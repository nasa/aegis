import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "../utils/store";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "../utils/duplicate";
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
    resetAllPresetInteractions: (state, action: { payload: { presetUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.presetInteractions[action.payload.presetUuid]).forEach((layerName) => {
        state.presetInteractions[action.payload.presetUuid][layerName].tabSelected = null;
      });
    },
    duplicatePreset: {
      reducer: (
        state,
        action: {
          payload: {
            preset: Preset;
            newPresetUuid: string;
          };
        }
      ) => {
        const newPreset: Preset = _.cloneDeep(action.payload.preset);
        newPreset.uuid = action.payload.newPresetUuid;
        newPreset.name = makeUniqueStringCopy(
          action.payload.preset.name,
          state.presets.map((item) => item.name)
        );
        state.presets.push(newPreset);
      },
      prepare: (payload: Preset) => {
        const newPresetUuid = uuidv4();
        return {
          payload: {
            preset: payload,
            newPresetUuid,
          },
        };
      },
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
  setPresetLayerControl,
  togglePresetLayerControlEnabled,
  setPresetLayerControlStyle,
  togglePresetInteractionLayerExpanded,
  setPresetInteractions,
  setPresetInteraction,
  deletePresetInteractions,
  setPresetEditMode,
  resetAllPresetInteractions,
} = presetSlice.actions;

import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "../utils/store";
import _ from "lodash";
import { roundDateToSecond } from "utils/formatting";
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
    upsertPreset: {
      reducer: (state, action: { payload: Preset }) => {
        upsertToArrayByUuid(state.presets, action.payload);
      },
      prepare: (preset: Preset, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: preset };
        } else {
          return { payload: { ...preset, updatedAt: roundDateToSecond(new Date()).toISOString() } };
        }
      },
    },
    upsertPresets: {
      reducer: (state, action: { payload: Preset[] }) => {
        action.payload.forEach((preset) => upsertToArrayByUuid(state.presets, preset));
      },
      prepare: (presets: Preset[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: presets };
        } else {
          return {
            payload: presets.map((preset) => ({
              ...preset,
              updatedAt: roundDateToSecond(new Date()).toISOString(),
            })),
          };
        }
      },
    },
    upsertPresetFromDb: (state, action: { payload: Preset }) => {
      upsertToArrayByUuid(state.presetsFromDb, action.payload);
    },
    upsertPresetsFromDb: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertToArrayByUuid(state.presetsFromDb, preset));
    },
    /* only called for populating store  */
    setPresets: (state, action: { payload: Preset[] }) => {
      state.presets = action.payload;
    },
    setPresetsFromDb: (state, action: { payload: Preset[] }) => {
      state.presetsFromDb = action.payload;
    },
    deletePresetByUuid: (state, action: { payload: string }) => {
      state.presets = state.presets.filter((preset) => preset.uuid !== action.payload);
    },
    deletePresetFromDbByUuid: (state, action: { payload: string }) => {
      state.presetsFromDb = state.presetsFromDb.filter((preset) => preset.uuid !== action.payload);
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
    togglePresetSublayerVisible: (
      state,
      action: { payload: { presetUuid: string; layerUuid: string } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapSublayerControls[action.payload.layerUuid].visible =
          !state.presets[presetIndex].mapSublayerControls[action.payload.layerUuid].visible;
        state.presets[presetIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
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
        state.presets[presetIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
    },
    setPresetSublayerStyle: (
      state,
      action: { payload: { presetUuid: string; layerUuid: string; style: MapSublayerStyle } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapSublayerControls[action.payload.layerUuid].style =
          action.payload.style;
        state.presets[presetIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
    },
    setPresetCircleStyle: (
      state,
      action: { payload: { presetUuid: string; radiusUuid: string; style: MapSublayerStyle } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapCircleControls[action.payload.radiusUuid].style =
          action.payload.style;
        state.presets[presetIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
    },
    togglePresetUIStateExpanded: (
      state,
      action: { payload: { presetUuid: string; uuid: string } }
    ) => {
      if (!_.isNil(state.presetsUIStates[action.payload.presetUuid][action.payload.uuid])) {
        state.presetsUIStates[action.payload.presetUuid][action.payload.uuid].expanded =
          !state.presetsUIStates[action.payload.presetUuid][action.payload.uuid].expanded;
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
    setPresetUIState: (
      state,
      action: {
        payload: {
          presetUuid: string;
          uuid: string;
          presetUIState: PresetUIState;
        };
      }
    ) => {
      state.presetsUIStates[action.payload.presetUuid][action.payload.uuid] =
        action.payload.presetUIState;
    },
    deletePresetUIStates: (state, action: { payload: { presetUuid: string } }) => {
      delete state.presetsUIStates[action.payload.presetUuid];
    },
    resetAllPresetUIStates: (state, action: { payload: { presetUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.presetsUIStates[action.payload.presetUuid]).forEach((uuid) => {
        state.presetsUIStates[action.payload.presetUuid][uuid].tabSelected = null;
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
    setStateForNewPreset: (state, action: { payload: { uuid: string } }) => {
      state.presetsEditing.push(action.payload.uuid); // turn on edit mode for the new Preset
      state.selectedPresetUuid = action.payload.uuid; // select the newly created Preset
      state.selectedRightNavItem = "info_panel";
    },
  },
});

export const {
  upsertPreset,
  upsertPresets,
  upsertPresetFromDb,
  upsertPresetsFromDb,
  setPresets,
  setPresetsFromDb,
  deletePresetByUuid,
  deletePresetFromDbByUuid,
  deleteAllPresetsFromDb,
  setStateForNewPreset,
  setSelectedPresetUuid,
  setSelectedPresetRightNavItem,
  togglePresetSublayerVisible,
  togglePresetCircleVisible,
  setPresetSublayerStyle,
  setPresetCircleStyle,
  togglePresetUIStateExpanded,
  setPresetUIStates,
  setPresetUIState,
  deletePresetUIStates,
  setPresetEditMode,
  resetAllPresetUIStates,
} = presetSlice.actions;

import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "./storeUtils/store";
import isNil from "lodash/isNil";
import cloneDeep from "lodash/cloneDeep";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { setAllSliceStores } from "store/crossActions";

export const initialState: PresetState = {
  presets: [],
  presetsFromDb: [],
  selectedPresetUuid: null,
  selectedRightNavItem: "info_panel",
  presetLayersUIStates: {},
  presetCirclesUIStates: {},
  presetsEditing: [],
  presetPreviewTime: null,
};

export const presetSlice = createSlice({
  name: "preset",
  initialState,
  reducers: {
    upsertPreset: {
      prepare: (preset: Preset, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: preset };
        } else {
          return {
            payload: { ...preset, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
      reducer: (state, action: { payload: Preset }) => {
        upsertToArrayByUuid(state.presets, action.payload);
      },
    },
    upsertPresets: {
      prepare: (presets: Preset[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: presets };
        } else {
          return {
            payload: presets.map((preset) => ({
              ...preset,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: Preset[] }) => {
        action.payload.forEach((preset) => upsertToArrayByUuid(state.presets, preset));
      },
    },
    upsertPresetFromDb: (state, action: { payload: Preset }) => {
      upsertToArrayByUuid(state.presetsFromDb, action.payload);
    },
    upsertPresetsFromDb: (state, action: { payload: Preset[] }) => {
      action.payload.forEach((preset) => upsertToArrayByUuid(state.presetsFromDb, preset));
    },
    upsertPresetByField: {
      prepare: (
        presetUuid: string,
        fieldName: keyof Preset,
        value: Preset[keyof Preset],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { presetUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              presetUuid,
              fieldName,
              value,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: {
          payload: {
            presetUuid: string;
            fieldName: keyof Preset;
            value: Preset[keyof Preset];
            updatedAt: string;
          };
        }
      ) => {
        const preset = state.presets.find((p) => p.uuid === action.payload.presetUuid);
        const newPreset: Preset = cloneDeep(preset);
        newPreset.updatedAt = action.payload.updatedAt || preset.updatedAt;
        const key = action.payload.fieldName;
        (newPreset as Record<typeof key, Preset[keyof Preset]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.presets, newPreset);
      },
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
    deletePresetsByUuid: (state, action: { payload: string[] }) => {
      state.presets = state.presets.filter((preset) => !action.payload.includes(preset.uuid));
    },
    deletePresetsFromDbByUuid: (state, action: { payload: string[] }) => {
      state.presetsFromDb = state.presetsFromDb.filter(
        (preset) => !action.payload.includes(preset.uuid)
      );
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

    /**
     * Preset Circle stuff
     */
    setPresetCircleStyle: (
      state,
      action: { payload: { presetUuid: string; circleDefUuid: string; style: MapSublayerStyle } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapCircleControls[action.payload.circleDefUuid].style =
          action.payload.style;
        state.presets[presetIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
    },
    setPresetPreviewTime: (state, action: { payload: { presetPreviewTime: string } }) => {
      state.presetPreviewTime = action.payload.presetPreviewTime;
    },
    togglePresetCircleVisible: (
      state,
      action: { payload: { presetUuid: string; circleUuid: string } }
    ) => {
      const presetIndex = state.presets.findIndex(
        (preset) => preset.uuid === action.payload.presetUuid
      );
      if (presetIndex >= 0) {
        state.presets[presetIndex].mapCircleControls[action.payload.circleUuid].visible =
          !state.presets[presetIndex].mapCircleControls[action.payload.circleUuid].visible;
        state.presets[presetIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
    },

    setPresetCircleUIStates: (
      state,
      action: {
        payload: {
          presetUuid: string;
          circleUIStates: CircleUIStates;
        };
      }
    ) => {
      state.presetCirclesUIStates[action.payload.presetUuid] = action.payload.circleUIStates;
    },
    setPresetCircleUIState: (
      state,
      action: {
        payload: {
          presetUuid: string;
          circleDefUuid: string;
          circleUIState: CircleUIState;
        };
      }
    ) => {
      state.presetCirclesUIStates[action.payload.presetUuid][action.payload.circleDefUuid] =
        action.payload.circleUIState;
    },
    deletePresetCirclesUIStates: (state, action: { payload: { presetUuid: string } }) => {
      delete state.presetCirclesUIStates[action.payload.presetUuid];
    },
    resetAllPresetCirclesUIStates: (state, action: { payload: { presetUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.presetCirclesUIStates[action.payload.presetUuid]).forEach((uuid) => {
        state.presetCirclesUIStates[action.payload.presetUuid][uuid].slidersSelected = false;
      });
    },

    /**
     * Preset Layer UI States
     */
    togglePresetLayerUIStateExpanded: (
      state,
      action: { payload: { presetUuid: string; uuid: string } }
    ) => {
      if (!isNil(state.presetLayersUIStates[action.payload.presetUuid][action.payload.uuid])) {
        state.presetLayersUIStates[action.payload.presetUuid][action.payload.uuid].expanded =
          !state.presetLayersUIStates[action.payload.presetUuid][action.payload.uuid].expanded;
      }
    },
    setPresetLayerUIStates: (
      state,
      action: {
        payload: {
          presetUuid: string;
          layerUIStates: LayerUIStates;
        };
      }
    ) => {
      state.presetLayersUIStates[action.payload.presetUuid] = action.payload.layerUIStates;
    },
    setPresetLayerUIState: (
      state,
      action: {
        payload: {
          presetUuid: string;
          layerUuid: string;
          layerUIState: LayerUIState;
        };
      }
    ) => {
      state.presetLayersUIStates[action.payload.presetUuid][action.payload.layerUuid] =
        action.payload.layerUIState;
    },
    deletePresetLayersUIStates: (state, action: { payload: { presetUuid: string } }) => {
      delete state.presetLayersUIStates[action.payload.presetUuid];
    },
    resetAllPresetLayersUIStates: (state, action: { payload: { presetUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.presetLayersUIStates[action.payload.presetUuid]).forEach((uuid) => {
        state.presetLayersUIStates[action.payload.presetUuid][uuid].tabSelected = null;
      });
    },

    /**
     * Preset Editing
     */
    setPresetEditMode: (state, action: { payload: { presetUuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        state.presetsEditing.push(action.payload.presetUuid);
      } else {
        state.presetsEditing = state.presetsEditing.filter(
          (uuid) => uuid !== action.payload.presetUuid
        );
      }
    },
    setStateForNewPreset: (state, action: { payload: { uuid: string } }) => {
      state.presetsEditing.push(action.payload.uuid); // turn on edit mode for the new Preset
      state.selectedPresetUuid = action.payload.uuid; // select the newly created Preset
      state.selectedRightNavItem = "info_panel";
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.preset);
    });
  },
});

export const {
  upsertPreset,
  upsertPresets,
  upsertPresetFromDb,
  upsertPresetsFromDb,
  upsertPresetByField,
  setPresets,
  setPresetsFromDb,
  deletePresetByUuid,
  deletePresetFromDbByUuid,
  deletePresetsByUuid,
  deletePresetsFromDbByUuid,
  deleteAllPresetsFromDb,
  setStateForNewPreset,
  setSelectedPresetUuid,
  setSelectedPresetRightNavItem,
  togglePresetSublayerVisible,
  togglePresetCircleVisible,
  setPresetSublayerStyle,
  setPresetCircleStyle,
  setPresetPreviewTime,
  setPresetCircleUIStates,
  setPresetCircleUIState,
  deletePresetCirclesUIStates,
  resetAllPresetCirclesUIStates,
  togglePresetLayerUIStateExpanded,
  setPresetLayerUIStates,
  setPresetLayerUIState,
  deletePresetLayersUIStates,
  setPresetEditMode,
  resetAllPresetLayersUIStates,
  obliterateState,
} = presetSlice.actions;

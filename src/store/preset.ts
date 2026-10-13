import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: PresetState = {
  selectedPresetUuid: null,
  selectedRightNavItem: "info_panel",
  presetLayersUIStates: {},
  presetCirclesUIStates: {},
  presetPreviewTime: null,
};

export const presetSlice = createSlice({
  name: "preset",
  initialState,
  reducers: {
    setSelectedPresetUuid: (state, action: { payload: string }) => {
      state.selectedPresetUuid = action.payload;
    },
    setSelectedPresetRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    /**
     * Preset Circle UI states
     */
    setPresetPreviewTime: (state, action: { payload: { presetPreviewTime: string } }) => {
      state.presetPreviewTime = action.payload.presetPreviewTime;
    },
    setAllPresetCirclesUIStates: (
      state,
      action: { payload: { circlesUIStates: CirclesUIStates } }
    ) => {
      state.presetCirclesUIStates = action.payload.circlesUIStates;
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
      // A preset created by another user has no UI states in this store yet
      state.presetLayersUIStates[action.payload.presetUuid] ??= {};
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

    selectPreset: (state, action: { payload: { uuid: string } }) => {
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
  selectPreset,
  setSelectedPresetUuid,
  setSelectedPresetRightNavItem,
  setPresetPreviewTime,
  setAllPresetCirclesUIStates,
  setPresetCircleUIStates,
  setPresetCircleUIState,
  deletePresetCirclesUIStates,
  resetAllPresetCirclesUIStates,
  setPresetLayerUIStates,
  setPresetLayerUIState,
  deletePresetLayersUIStates,
  resetAllPresetLayersUIStates,
  obliterateState,
} = presetSlice.actions;

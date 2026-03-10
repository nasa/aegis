import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores, clearAllEditing } from "store/crossActions";

export const initialState: MissionState = {
  layers: null,
  sublayers: null,
  selectedRightNavItem: "prefs_panel",
  missionSectionsEditing: [],
  automergeUrl: "",
};

export const missionSlice = createSlice({
  name: "mission",
  initialState,
  reducers: {
    /* only called for populating store  */
    setLayers: (state, action: { payload: Layer[] }) => {
      state.layers = action.payload;
    },
    /* only called for populating store  */
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
    setAutomergeUrl: (state, action: { payload: string }) => {
      state.automergeUrl = action.payload;
    },
    obliterateState: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.mission);
    });

    builder.addCase(clearAllEditing, (state) => {
      state.missionSectionsEditing = [];
    });
  },
});

export const {
  setLayers,
  setSublayers,
  setSelectedMissionRightNavItem,
  setMissionSectionEditing,
  setAutomergeUrl,
  obliterateState,
} = missionSlice.actions;

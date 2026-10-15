import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores, clearAllEditing } from "store/crossActions";

export const initialState: MissionState = {
  selectedRightNavItem: "prefs_panel",
  isInEditMode: false,
  automergeUrl: "",
};

export const missionSlice = createSlice({
  name: "mission",
  initialState,
  reducers: {
    setSelectedMissionRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    /**
     * Single global edit-mode toggle. When on, edit mode is enabled for
     * mission, eva, traverse, station, poi, rex, and action sections.
     */
    setIsInEditMode: (state, action: { payload: boolean }) => {
      state.isInEditMode = action.payload;
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
      state.isInEditMode = false;
    });
  },
});

export const { setSelectedMissionRightNavItem, setIsInEditMode, setAutomergeUrl, obliterateState } =
  missionSlice.actions;

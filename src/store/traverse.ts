import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: TraverseState = {
  selectedTraverseRightNavItem: "info_panel",
};

export const traverseSlice = createSlice({
  name: "traverse",
  initialState,
  reducers: {
    setSelectedTraverseRightNavItem: (state, action: { payload: string }) => {
      state.selectedTraverseRightNavItem = action.payload;
    },

    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.traverse);
    });
  },
});

export const { setSelectedTraverseRightNavItem, obliterateState } = traverseSlice.actions;

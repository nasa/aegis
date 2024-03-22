import { createSlice } from "@reduxjs/toolkit";

export const initialState: STMState = {
  level1s: [],
  level2s: [],
  level3s: [],
  loadingStatus: "unloaded",
};

export const stmSlice = createSlice({
  name: "stm",
  initialState,
  reducers: {
    /* only called for populating store  */
    setLevel1s: (state, action: { payload: STMLevel1[] }) => {
      state.level1s = action.payload;
    },
    /* only called for populating store  */
    setLevel2s: (state, action: { payload: STMLevel2[] }) => {
      state.level2s = action.payload;
    },
    /* only called for populating store  */
    setLevel3s: (state, action: { payload: STMLevel3[] }) => {
      state.level3s = action.payload;
    },
    setStmLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const { setLevel1s, setLevel2s, setLevel3s, setStmLoadingStatus, obliterateState } =
  stmSlice.actions;

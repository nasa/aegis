import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: STMState = {
  level1s: [],
  level2s: [],
  level3s: [],
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
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.stm);
    });
  },
});

export const { setLevel1s, setLevel2s, setLevel3s, obliterateState } = stmSlice.actions;

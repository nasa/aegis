import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: RexState = {
  selectedRexUuid: null,
  selectedPosEntryUuid: null,
  posEntryInEdit: null,
};

export const rexSlice = createSlice({
  name: "rex",
  initialState,
  reducers: {
    setSelectedRexUuid: (state, action: { payload: string }) => {
      state.selectedRexUuid = action.payload;
      state.selectedPosEntryUuid = null;
    },
    setSelectedPosEntryUuid: (state, action: { payload: string }) => {
      state.selectedPosEntryUuid = action.payload;
    },
    setPosEntryInEdit: (state, action: { payload: PosEntry | null }) => {
      state.posEntryInEdit = action.payload;
    },
    clearPosEntryInEdit: (state) => {
      state.posEntryInEdit = {
        ...state.posEntryInEdit,
        uuid: null,
        location: null,
        elevation: null,
        petSeconds: null,
        createdAt: null,
        updatedAt: null,
      };
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.rex);
    });
  },
});

export const {
  setSelectedRexUuid,
  setSelectedPosEntryUuid,
  setPosEntryInEdit,
  clearPosEntryInEdit,
  obliterateState,
} = rexSlice.actions;

import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores, clearAllEditing } from "store/crossActions";

export const initialState: ActionState = {
  actionsExpanded: [],
};

export const actionSlice = createSlice({
  name: "action",
  initialState,
  reducers: {
    collapseActions: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        state.actionsExpanded = state.actionsExpanded.filter(
          (existingUuid) => existingUuid !== uuid
        );
      });
    },
    expandActions: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        if (!state.actionsExpanded.includes(uuid)) {
          state.actionsExpanded.push(uuid);
        }
      });
    },
    obliterateState: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.action);
    });

    builder.addCase(clearAllEditing, (state) => {
      state.actionsExpanded = [];
    });
  },
});

export const { collapseActions, expandActions, obliterateState } = actionSlice.actions;

export default actionSlice.reducer;

import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: ActionState = {
  actions: [],
  actionsFromDb: [],
};

export const actionSlice = createSlice({
  name: "action",
  initialState,
  reducers: {
    upsertAction: (state, action: { payload: Action }) => {
      upsertToArrayByUuid(state.actions, action.payload);
    },
    upsertActions: (state, action: { payload: Action[] }) => {
      action.payload.forEach((action) => upsertToArrayByUuid(state.actions, action));
    },
    upsertActionsFromDb: (state, action: { payload: Action[] }) => {
      action.payload.forEach((action) => upsertToArrayByUuid(state.actionsFromDb, action));
    },
    setActions: (state, action: { payload: Action[] }) => {
      state.actions = action.payload;
    },
    setActionsFromDb: (state, action: { payload: Action[] }) => {
      state.actionsFromDb = action.payload;
    },
    deleteActionByUuid: (state, action: { payload: string }) => {
      state.actions.splice(
        state.actions.findIndex((stateAction) => stateAction.uuid === action.payload),
        1
      );
    },
    deleteActionFromDbByUuid: (state, action: { payload: string }) => {
      state.actionsFromDb.splice(
        state.actionsFromDb.findIndex((stateAction) => stateAction.uuid === action.payload),
        1
      );
    },
    deleteActionsByUuid: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        state.actions.splice(
          state.actions.findIndex((stateAction) => stateAction.uuid === uuid),
          1
        );
      });
    },
    deleteActionsFromDbByUuid: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuidtoDelete) => {
        const actionIndex = state.actionsFromDb.findIndex(
          (stateAction) => stateAction.uuid === uuidtoDelete
        );
        if (actionIndex >= 0) state.actionsFromDb.splice(actionIndex, 1);
      });
    },
  },
});

export const {
  upsertAction,
  upsertActions,
  upsertActionsFromDb,
  setActions,
  setActionsFromDb,
  deleteActionByUuid,
  deleteActionFromDbByUuid,
  deleteActionsByUuid,
  deleteActionsFromDbByUuid,
} = actionSlice.actions;

export default actionSlice.reducer;

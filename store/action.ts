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
    deleteAction: (state, action: { payload: Action }) => {
      // state.actions = state.actions.filter(
      //   (stateAction: Action) => stateAction.uuid !== action.payload.uuid
      // );
      state.actions.splice(
        state.actions.findIndex((stateAction) => stateAction.uuid === action.payload.uuid),
        1
      );
    },
    deleteActions: (state, action: { payload: Action[] }) => {
      action.payload.forEach((actionToDelete) => {
        state.actions.splice(
          state.actions.findIndex((stateAction) => stateAction.uuid === actionToDelete.uuid),
          1
        );
      });
    },
    deleteActionsFromDb: (state, action: { payload: Action[] }) => {
      action.payload.forEach((actionToDelete) => {
        const actionIndex = state.actionsFromDb.findIndex(
          (stateAction) => stateAction.uuid === actionToDelete.uuid
        );
        if (actionIndex >= 0) state.actionsFromDb.splice(actionIndex, 1);
      });
    },
    deleteAllActions: (state) => {
      state.actions = [];
    },
    deleteAllActionsFromDb: (state) => {
      state.actionsFromDb = [];
    },
  },
});

export const {
  upsertAction,
  upsertActions,
  upsertActionsFromDb,
  deleteAction,
  deleteActions,
  deleteActionsFromDb,
  deleteAllActions,
  deleteAllActionsFromDb,
} = actionSlice.actions;

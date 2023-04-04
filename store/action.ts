import { createSlice } from "@reduxjs/toolkit";
import _ from "lodash";
import { upsertToArrayByUuid } from "utils/store";
import { v4 as uuidv4 } from "uuid";

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
    duplicateAction: (
      state,
      action: { payload: { action: Action; stationUuid?: string; poiUuid?: string } }
    ) => {
      const newAction: Action = _.cloneDeep(action.payload.action);
      newAction.uuid = uuidv4();
      newAction.parentActionUuid = action.payload.action.uuid;
      newAction.stationUuid = action.payload.stationUuid;
      newAction.poiUuid = action.payload.poiUuid;
      newAction.name = `${newAction.name} (copy)`;
      state.actions.push(newAction);
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
  duplicateAction,
} = actionSlice.actions;

export default actionSlice.reducer;

import { createSlice } from "@reduxjs/toolkit";
import _ from "lodash";
import { upsertToArrayByUuid } from "utils/store";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "../utils/duplicate";

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
    duplicateAction: {
      reducer: (
        state,
        action: {
          payload: {
            action: Action;
            stationUuid?: string;
            poiUuid?: string;
            preserveParentUuid?: boolean;
            newActionUuid: string;
          };
        }
      ) => {
        const newAction: Action = _.cloneDeep(action.payload.action);
        newAction.uuid = action.payload.newActionUuid;
        newAction.stationUuid = action.payload.stationUuid;
        newAction.poiUuid = action.payload.poiUuid;
        newAction.name = makeUniqueStringCopy(
          newAction.name,
          state.actions.map((a) => a.name)
        );
        if (action.payload.preserveParentUuid) {
          newAction.parentActionUuid = action.payload.action.uuid;
        } else {
          newAction.parentActionUuid = null;
        }
        state.actions.push(newAction);
      },
      prepare: (payload: {
        action: Action;
        stationUuid?: string;
        poiUuid?: string;
        preserveParentUuid?: boolean;
      }) => {
        const { action, stationUuid, poiUuid, preserveParentUuid } = payload;
        const newActionUuid = uuidv4();
        return {
          payload: {
            action: action,
            stationUuid: stationUuid,
            poiUuid: poiUuid,
            preserveParentUuid: preserveParentUuid,
            newActionUuid,
          },
        };
      },
    },
  },
});

export const {
  upsertAction,
  upsertActions,
  upsertActionsFromDb,
  setActions,
  setActionsFromDb,
  deleteAction,
  deleteActions,
  deleteActionsFromDb,
  deleteAllActions,
  deleteAllActionsFromDb,
  duplicateAction,
} = actionSlice.actions;

export default actionSlice.reducer;

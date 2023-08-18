import { createSlice } from "@reduxjs/toolkit";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: ActionState = {
  actions: [],
  actionsFromDb: [],
};

export const actionSlice = createSlice({
  name: "action",
  initialState,
  reducers: {
    upsertAction: {
      reducer: (state, action: { payload: Action }) => {
        upsertToArrayByUuid(state.actions, action.payload);
      },
      prepare: (action: Action, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: action };
        } else {
          return {
            payload: { ...action, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
    },
    upsertActions: {
      reducer: (state, action: { payload: Action[] }) => {
        action.payload.forEach((action) => upsertToArrayByUuid(state.actions, action));
      },
      prepare: (actions: Action[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: actions };
        } else {
          const updatedActions = actions.map((a) => {
            return { ...a, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() };
          });
          return { payload: updatedActions };
        }
      },
    },
    upsertActionFromDb: (state, action: { payload: Action }) => {
      upsertToArrayByUuid(state.actionsFromDb, action.payload);
    },
    upsertActionsFromDb: (state, action: { payload: Action[] }) => {
      action.payload.forEach((action) => upsertToArrayByUuid(state.actionsFromDb, action));
    },
    /* only called for populating store  */
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
  upsertActionFromDb,
  upsertActionsFromDb,
  setActions,
  setActionsFromDb,
  deleteActionByUuid,
  deleteActionFromDbByUuid,
  deleteActionsByUuid,
  deleteActionsFromDbByUuid,
} = actionSlice.actions;

export default actionSlice.reducer;

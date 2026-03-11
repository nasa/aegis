import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { getAccurateNow } from "utils/formatting";
import { upsertToArrayByUuid } from "store/storeUtils/store";
import { setAllSliceStores } from "store/crossActions";

export const initialState: ActionState = {
  actions: [],
  actionsFromDb: [],
  actionsExpanded: [],
};

export const actionSlice = createSlice({
  name: "action",
  initialState,
  reducers: {
    upsertActions: {
      prepare: (actions: Action[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: actions };
        } else {
          const updatedActions = actions.map((a) => {
            return { ...a, updatedAt: getAccurateNow().getTime() };
          });
          return { payload: updatedActions };
        }
      },
      reducer: (state, action: { payload: Action[] }) => {
        action.payload.forEach((action) => upsertToArrayByUuid(state.actions, action));
      },
    },
    upsertActionsFromDb: (state, action: { payload: Action[] }) => {
      action.payload.forEach((action) => upsertToArrayByUuid(state.actionsFromDb, action));
    },
    upsertActionByField: {
      prepare: (
        actionUuid: string,
        fieldName: keyof Action,
        value: Action[keyof Action],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { actionUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              actionUuid,
              fieldName,
              value,
              updatedAt: getAccurateNow().getTime(),
            },
          };
        }
      },
      reducer: (
        state,
        action: {
          payload: {
            actionUuid: string;
            fieldName: keyof Action;
            value: Action[keyof Action];
            updatedAt: number;
          };
        }
      ) => {
        const actionItem = state.actions.find((s) => s.uuid === action.payload.actionUuid);
        const newAction: Action = cloneDeep(actionItem);
        newAction.updatedAt = action.payload.updatedAt || actionItem.updatedAt;
        const key = action.payload.fieldName;
        (newAction as Record<typeof key, Action[keyof Action]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.actions, newAction);
      },
    },
    deleteActionsByUuid: (state, action: { payload: string[] }) => {
      state.actions = state.actions.filter((a) => !action.payload.includes(a.uuid));
    },
    deleteActionsFromDbByUuid: (state, action: { payload: string[] }) => {
      state.actionsFromDb = state.actionsFromDb.filter((a) => !action.payload.includes(a.uuid));
    },
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
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.action);
    });
  },
});

export const {
  upsertActions,
  upsertActionsFromDb,
  upsertActionByField,
  deleteActionsByUuid,
  deleteActionsFromDbByUuid,
  collapseActions,
  expandActions,
  obliterateState,
} = actionSlice.actions;

export default actionSlice.reducer;

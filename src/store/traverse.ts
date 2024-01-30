import { createSlice } from "@reduxjs/toolkit";
import { cloneDeep } from "lodash";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: TraverseState = {
  traverses: [],
  traversesFromDb: [],
  traversesEditing: [],
  selectedTraverseRightNavItem: "info_panel",
  calculatedFields: [],
  loadingStatus: "unloaded",
};

export const traverseSlice = createSlice({
  name: "traverse",
  initialState,
  reducers: {
    upsertTraverses: {
      prepare: (traverses: Traverse[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: traverses };
        } else {
          return {
            payload: traverses.map((traverse) => ({
              ...traverse,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: Traverse[] }) => {
        action.payload.forEach((traverse) => upsertToArrayByUuid(state.traverses, traverse));
      },
    },
    upsertTraversesFromDb: (state, action: { payload: Traverse[] }) => {
      action.payload.forEach((traverse) => upsertToArrayByUuid(state.traversesFromDb, traverse));
    },
    upsertTraverseByField: {
      prepare: (
        traverseUuid: string,
        fieldName: keyof Traverse,
        value: Traverse[keyof Traverse],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { traverseUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              traverseUuid,
              fieldName,
              value,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: {
          payload: {
            traverseUuid: string;
            fieldName: keyof Traverse;
            value: Traverse[keyof Traverse];
            updatedAt: string;
          };
        }
      ) => {
        const traverse = state.traverses.find((s) => s.uuid === action.payload.traverseUuid);
        const newTraverse: Traverse = cloneDeep(traverse);
        newTraverse.updatedAt = action.payload.updatedAt || traverse.updatedAt;
        const key = action.payload.fieldName;
        (newTraverse as Record<typeof key, Traverse[keyof Traverse]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.traverses, newTraverse);
      },
    },
    /* only called for populating store  */
    setTraverses: (state, action: { payload: Traverse[] }) => {
      state.traverses = action.payload;
    },
    setTraversesFromDb: (state, action: { payload: Traverse[] }) => {
      state.traversesFromDb = action.payload;
    },
    deleteTraversesByUuid: (state, action: { payload: string[] }) => {
      state.traverses = state.traverses.filter(
        (traverse) => !action.payload.includes(traverse.uuid)
      );
    },
    deleteTraversesFromDbByUuid: (state, action: { payload: string[] }) => {
      state.traversesFromDb = state.traversesFromDb.filter(
        (traverse) => !action.payload.includes(traverse.uuid)
      );
    },
    setSelectedTraverseRightNavItem: (state, action: { payload: string }) => {
      state.selectedTraverseRightNavItem = action.payload;
    },
    setTraverseEditMode: (state, action: { payload: { uuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        state.traversesEditing.push(action.payload.uuid);
      } else {
        state.traversesEditing = state.traversesEditing.filter(
          (uuid) => uuid !== action.payload.uuid
        );
      }
    },
    revertTraversePath: (state, action: { payload: { uuid: string } }) => {
      const traverse = state.traverses.find((traverse) => traverse.uuid === action.payload.uuid);
      const traverseFromDb = state.traversesFromDb.find(
        (traverse) => traverse.uuid === action.payload.uuid
      );
      if (traverse && traverseFromDb) {
        traverse.path = traverseFromDb.path;
        traverse.pathSegmentDistances = traverseFromDb.pathSegmentDistances;
        traverse.pathSegmentElevations = traverseFromDb.pathSegmentElevations;
      }
    },
    setTraverseCalculatedFields: (
      state,
      action: { payload: { calculatedFields: TraverseCalculatedFields[] } }
    ) => {
      state.calculatedFields = action.payload.calculatedFields;
    },
    setTraverseLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const {
  upsertTraverses,
  upsertTraversesFromDb,
  upsertTraverseByField,
  setTraverses,
  setTraversesFromDb,
  deleteTraversesByUuid,
  deleteTraversesFromDbByUuid,
  setSelectedTraverseRightNavItem,
  setTraverseEditMode,
  revertTraversePath,
  setTraverseCalculatedFields,
  setTraverseLoadingStatus,
  obliterateState,
} = traverseSlice.actions;

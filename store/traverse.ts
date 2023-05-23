import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: TraverseState = {
  traverses: [],
  traversesFromDb: [],
  traversesEditing: [],
  selectedTraverseRightNavItem: "info_panel",
  calculatedFields: [],
};

export const traverseSlice = createSlice({
  name: "traverse",
  initialState,
  reducers: {
    upsertTraverse: (state, action: { payload: Traverse }) => {
      upsertToArrayByUuid(state.traverses, action.payload);
    },
    upsertTraverseFromDb: (state, action: { payload: Traverse }) => {
      upsertToArrayByUuid(state.traversesFromDb, action.payload);
    },
    setTraverses: (state, action: { payload: Traverse[] }) => {
      state.traverses = action.payload;
    },
    setTraversesFromDb: (state, action: { payload: Traverse[] }) => {
      state.traversesFromDb = action.payload;
    },

    deleteTraverse: (state, action: { payload: { uuid: string } }) => {
      state.traverses = state.traverses.filter((traverse) => traverse.uuid !== action.payload.uuid);
    },
    deleteTraverseFromDb: (state, action: { payload: { uuid: string } }) => {
      state.traversesFromDb = state.traversesFromDb.filter(
        (traverse) => traverse.uuid !== action.payload.uuid
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
    updateTraversePath: (
      state,
      action: {
        payload: {
          uuid: string;
          path: AEGISPoint[];
          pathSegmentDistances: number[];
          pathSegmentElevations?: number[][];
        };
      }
    ) => {
      const traverse = state.traverses.find((traverse) => traverse.uuid === action.payload.uuid);
      if (traverse) {
        traverse.path = action.payload.path;
        traverse.pathSegmentDistances = action.payload.pathSegmentDistances;
        if (action.payload.pathSegmentElevations) {
          traverse.pathSegmentElevations = action.payload.pathSegmentElevations;
        }
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
    duplicateTraverse: (state, action: { payload: Traverse }) => {
      state.traverses.push(action.payload);
      // turn on edit mode for the new traverse
      state.traversesEditing.push(action.payload.uuid);
    },
  },
});

export const {
  upsertTraverse,
  upsertTraverseFromDb,
  setTraverses,
  setTraversesFromDb,
  deleteTraverse,
  deleteTraverseFromDb,
  setSelectedTraverseRightNavItem,
  setTraverseEditMode,
  updateTraversePath,
  revertTraversePath,
  setTraverseCalculatedFields,
  duplicateTraverse,
} = traverseSlice.actions;

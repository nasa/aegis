import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: TraverseState = {
  traverses: [],
  traversesFromDb: [],
  traversesEditing: [],
  selectedTraverseRightNavItem: "",
};

export const traverseSlice = createSlice({
  name: "traverse",
  initialState,
  reducers: {
    upsertTraverses: (state, action: { payload: Traverse[] }) => {
      action.payload.forEach((traverse) => upsertToArrayByUuid(state.traverses, traverse));
    },
    upsertTraverse: (state, action: { payload: Traverse }) => {
      upsertToArrayByUuid(state.traverses, action.payload);
    },
    replaceAllTraversesFromDb: (state, action: { payload: Traverse[] }) => {
      state.traversesFromDb = action.payload;
    },
    upsertTraverseFromDb: (state, action: { payload: Traverse }) => {
      upsertToArrayByUuid(state.traversesFromDb, action.payload);
    },

    deleteTraverse: (state, action: { payload: { uuid: string } }) => {
      state.traverses = state.traverses.filter((traverse) => traverse.uuid !== action.payload.uuid);
    },
    deleteTraverseFromDb: (state, action: { payload: { uuid: string } }) => {
      state.traversesFromDb = state.traversesFromDb.filter(
        (traverse) => traverse.uuid !== action.payload.uuid
      );
    },
    deleteAllTraverses: (state) => {
      state.traverses = [];
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
    updateTraverseLocationAndDistance: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint[]; distance: number[] } }
    ) => {
      const traverse = state.traverses.find((traverse) => traverse.uuid === action.payload.uuid);
      if (traverse) {
        traverse.location = action.payload.location;
        traverse.distance = action.payload.distance;
      }
    },
    revertTraverseLocationAndDistance: (state, action: { payload: { uuid: string } }) => {
      const traverse = state.traverses.find((traverse) => traverse.uuid === action.payload.uuid);
      const traverseFromDb = state.traversesFromDb.find(
        (traverse) => traverse.uuid === action.payload.uuid
      );
      if (traverse && traverseFromDb) {
        traverse.location = traverseFromDb.location;
        traverse.distance = traverseFromDb.distance;
      }
    },
  },
});

export const {
  upsertTraverses,
  upsertTraverse,
  replaceAllTraversesFromDb,
  upsertTraverseFromDb,
  deleteTraverse,
  deleteTraverseFromDb,
  deleteAllTraverses,
  setSelectedTraverseRightNavItem,
  setTraverseEditMode,
  updateTraverseLocationAndDistance,
  revertTraverseLocationAndDistance,
} = traverseSlice.actions;

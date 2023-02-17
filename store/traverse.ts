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

    deleteTraverse: (state, action: { payload: { traverseUuid: string } }) => {
      state.traverses = state.traverses.filter(
        (traverse) => traverse.uuid !== action.payload.traverseUuid
      );
    },
    deleteTraverseFromDb: (state, action: { payload: { traverseUuid: string } }) => {
      state.traversesFromDb = state.traversesFromDb.filter(
        (traverse) => traverse.uuid !== action.payload.traverseUuid
      );
    },
    deleteAllTraverses: (state) => {
      state.traverses = [];
    },
    setSelectedTraverseRightNavItem: (state, action: { payload: string }) => {
      state.selectedTraverseRightNavItem = action.payload;
    },
    setTraverseEditMode: (
      state,
      action: { payload: { traverseUuid: string; editMode: boolean } }
    ) => {
      if (action.payload.editMode) {
        state.traversesEditing.push(action.payload.traverseUuid);
      } else {
        state.traversesEditing = state.traversesEditing.filter(
          (uuid) => uuid !== action.payload.traverseUuid
        );
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
} = traverseSlice.actions;

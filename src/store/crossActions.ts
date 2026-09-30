import { createAction } from "@reduxjs/toolkit";

// action for populating the store in a single call
export const setAllSliceStores = createAction<WholeStoreState>("shared/setAllSliceStores");

// clear the sections currently being edited across all slices
// all stores should implement this as they are migrated over to automerge
// this will eventually be replaced when there is a single tracked edit mode for the entire client side
export const clearAllEditing = createAction("shared/clearAllEditing");

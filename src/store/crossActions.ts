import { createAction } from "@reduxjs/toolkit";

// action for populating the store in a single call
export const setAllSliceStores = createAction<WholeStoreState>("shared/setAllSliceStores");

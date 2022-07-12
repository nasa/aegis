import { combineReducers, configureStore, getDefaultMiddleware } from "@reduxjs/toolkit";
import { createWrapper } from "next-redux-wrapper";

import { playheadSlice, initialState as playheadInitialState } from "./playhead";
import { playheadHoverSlice, initialState as playheadHoverInitialState } from "./playheadHover";
import { mmgisConfigSlice, initialState as mmgisConfigInitialState } from "./mmgis";
import { userSlice, initialState as userInitialState } from "./user";
import { mapSlice, initialState as mapInitialState } from "./map";

let store;

export const initialState = {
  playhead: playheadInitialState,
  playheadHover: playheadHoverInitialState,
  mmgisConfig: mmgisConfigInitialState,
  user: userInitialState,
  map: mapInitialState,
};

const reducer = combineReducers({
  playhead: playheadSlice.reducer,
  playheadHover: playheadHoverSlice.reducer,
  mmgisConfig: mmgisConfigSlice.reducer,
  user: userSlice.reducer,
  map: mapSlice.reducer,
});
export type RootState = ReturnType<typeof reducer>;

const initStore = () => {
  store = configureStore({
    reducer,
    preloadedState: initialState,
    devTools: true,
  });
  return store;
};

export const wrapper = createWrapper(initStore);

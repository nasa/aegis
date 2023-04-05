import { configureStore, PreloadedState } from "@reduxjs/toolkit";
import { StoreType, reducer, RootState } from "../../store";

const makeTestStore = (preloadedState: PreloadedState<RootState>): StoreType => {
  return configureStore({
    reducer,
    preloadedState,
  });
};

export default makeTestStore;

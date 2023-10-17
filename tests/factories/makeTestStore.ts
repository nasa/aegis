import { configureStore, PreloadedState } from "@reduxjs/toolkit";
import { StoreType, reducer, RootState } from "../../store";

const createTestStore = (preloadedState: PreloadedState<RootState>): StoreType => {
  return configureStore({
    reducer,
    preloadedState,
  });
};

export default createTestStore;

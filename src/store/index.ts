import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { hoverSlice, initialState as hoverInitialState } from "./hover";
import { missionSlice, initialState as missionInitialState } from "./mission";
import { mapSlice, initialState as mapInitialState } from "./map";
import { evaSlice, initialState as evaInitialState } from "./eva";
import { poiSlice, initialState as poiInitialState } from "./poi";
import { interfaceSlice, initialState as interfaceInitialState } from "./interface";
import { stmSlice, initialState as stmInitialState } from "./stm";
import { presetSlice, initialState as presetInitialState } from "./preset";
import { stationSlice, initialState as stationInitialState } from "./station";
import { actionSlice, initialState as actionInitialState } from "./action";
import { traverseSlice, initialState as traverseInitialState } from "./traverse";
import { userSlice, initialState as userInitialState } from "./user";
import { rexSlice, initialState as rexInitialState } from "./rex";
import { measureSlice, initialState as measureInitialState } from "./measure";
import { isRejected } from "@reduxjs/toolkit";
import type { Middleware } from "@reduxjs/toolkit";

export const initialState: WholeStoreState = {
  hover: hoverInitialState,
  mission: missionInitialState,
  user: userInitialState,
  map: mapInitialState,
  eva: evaInitialState,
  poi: poiInitialState,
  interface: interfaceInitialState,
  stm: stmInitialState,
  preset: presetInitialState,
  station: stationInitialState,
  action: actionInitialState,
  traverse: traverseInitialState,
  rex: rexInitialState,
  measure: measureInitialState,
};

export const sliceReducers = combineReducers({
  hover: hoverSlice.reducer,
  mission: missionSlice.reducer,
  user: userSlice.reducer,
  map: mapSlice.reducer,
  eva: evaSlice.reducer,
  poi: poiSlice.reducer,
  interface: interfaceSlice.reducer,
  stm: stmSlice.reducer,
  preset: presetSlice.reducer,
  station: stationSlice.reducer,
  action: actionSlice.reducer,
  traverse: traverseSlice.reducer,
  rex: rexSlice.reducer,
  measure: measureSlice.reducer,
});

export type RootState = ReturnType<typeof sliceReducers>;

// Add middleware to log rejected thunks to the browser console
const rejectedActionLogger: Middleware<{}, RootState> = () => (next) => (action) => {
  if (isRejected(action)) {
    console.error("Rejected async thunk. Action = ", { action });
  }
  return next(action);
};

export const store: StoreType = configureStore({
  reducer: sliceReducers,
  preloadedState: initialState,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(rejectedActionLogger),
  devTools: {
    name: `AEGIS Tab-${Math.random()}`, // Include git branch name
  },
});
export type StoreType = ReturnType<typeof configureStore<RootState>>;
export type AppDispatch = typeof store.dispatch;

export default store;

import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { hoverSlice, initialState as hoverInitialState } from "./hover";
import { missionSlice, initialState as missionInitialState } from "./mission";
import { mapSlice, initialState as mapInitialState } from "./map";
import { evaSlice, initialState as evaInitialState } from "./eva";
import { poiSlice, initialState as poiInitialState } from "./poi";
import { interfaceSlice, initialState as interfaceInitialState } from "./interface";
import { connectionSlice, initialState as connectionInitialState } from "./connection";
import { stmSlice, initialState as stmInitialState } from "./stm";
import { presetSlice, initialState as presetInitialState } from "./preset";
import { stationSlice, initialState as stationInitialState } from "./station";
import { actionSlice, initialState as actionInitialState } from "./action";
import { traverseSlice, initialState as traverseInitialState } from "./traverse";
import { userSlice, initialState as userInitialState } from "./user";
import { rexSlice, initialState as rexInitialState } from "./rex";
import { measureSlice, initialState as measureInitialState } from "./measure";
import { isRejected } from "@reduxjs/toolkit";
import type { Middleware, Unsubscribe } from "@reduxjs/toolkit";
import { clientLogger } from "utils/logging/clientLogger";

export const initialState: WholeStoreState = {
  hover: hoverInitialState,
  mission: missionInitialState,
  user: userInitialState,
  map: mapInitialState,
  eva: evaInitialState,
  poi: poiInitialState,
  interface: interfaceInitialState,
  connection: connectionInitialState,
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
  connection: connectionSlice.reducer,
  stm: stmSlice.reducer,
  preset: presetSlice.reducer,
  station: stationSlice.reducer,
  action: actionSlice.reducer,
  traverse: traverseSlice.reducer,
  rex: rexSlice.reducer,
  measure: measureSlice.reducer,
});

export type RootState = ReturnType<typeof sliceReducers>;
export type StoreType = ReturnType<typeof configureStore<RootState>>;

// Add middleware to log rejected thunks to the browser console
const rejectedActionLogger: Middleware<{}, RootState> = () => (next) => (action) => {
  if (isRejected(action)) {
    const reason = action.payload ?? action.error?.message ?? action.error?.name ?? "Unknown error";
    clientLogger.error(
      { logId: "redux", logValue: `Rejected action: ${action.type} — ${reason}` },
      new Error(action.error?.message ?? "Rejected async thunk")
    );
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

// create an observer for the store subscribe so anyone can hook into it
export function observeStore(
  store: StoreType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (state: RootState) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (oldState: any, newState: any) => void
): Unsubscribe {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oldState: any;
  function handleChange() {
    const newState = select(store.getState());
    if (!oldState) {
      oldState = newState;
    } else if (newState !== oldState) {
      onChange(oldState, newState);
      oldState = newState;
    }
  }

  const unsubscribe = store.subscribe(handleChange);
  return unsubscribe;
}

export default store;

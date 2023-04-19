import { CombinedState, PayloadAction, combineReducers, configureStore } from "@reduxjs/toolkit";
import { createWrapper } from "next-redux-wrapper";

import { playheadSlice, initialState as playheadInitialState } from "./playhead";
import { playheadHoverSlice, initialState as playheadHoverInitialState } from "./playheadHover";
import { missionSlice, initialState as missionInitialState } from "./mission";
import { userSlice, initialState as userInitialState } from "./user";
import { mapSlice, initialState as mapInitialState } from "./map";
import { evaSlice, initialState as evaInitialState } from "./eva";
import { poiSlice, initialState as poiInitialState } from "./poi";
import { interfaceSlice, initialState as interfaceInitialState } from "./interface";
import { stmSlice, initialState as stmInitialState } from "./stm";
import { presetSlice, initialState as presetInitialState } from "./preset";
import { stationSlice, initialState as stationInitialState } from "./station";
import { actionSlice, initialState as actionInitialState } from "./action";
import { traverseSlice, initialState as traverseInitialState } from "./traverse";
import { crossSlice } from "./cross-slice";

export type StoreType = ReturnType<typeof configureStore<RootState>>;
let store: StoreType;

export type AppDispatch = typeof store.dispatch;

export const initialState = {
  playhead: playheadInitialState,
  playheadHover: playheadHoverInitialState,
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
};

const sliceReducers = combineReducers({
  playhead: playheadSlice.reducer,
  playheadHover: playheadHoverSlice.reducer,
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
});

export type RootState = ReturnType<typeof sliceReducers>;

export const reducer = function (
  state: CombinedState<RootState>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: PayloadAction<any>
): CombinedState<RootState> {
  const intermediateState = sliceReducers(state, action);
  const finalState = crossSlice.reducer(intermediateState, action);
  return finalState;
};

const initStore = (): StoreType => {
  store = configureStore({
    reducer,
    preloadedState: initialState,
    devTools: true,
  });
  return store;
};

export const wrapper = createWrapper(initStore);

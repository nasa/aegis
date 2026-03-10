import { createSlice } from "@reduxjs/toolkit";

export const initialState: ConnectionState = {
  socketStatus: {
    connectionStatus: "disconnected",
    lastEditEvent: null,
    lastStatusFromServer: {
      visitorCounts: {
        editors: 0,
        viewers: 0,
      },
      timestamp: 0,
      serverVersion: null,
    },
  },
  browserConnectionStatus: "connected", // start connected because if the user has loaded the app, they have a browser connection.
  appVersion: null,
};

export const connectionSlice = createSlice({
  name: "connection",
  initialState,
  reducers: {
    setLastStatusFromServer: (state, action: { payload: StatusFromServer }) => {
      state.socketStatus.lastStatusFromServer = action.payload;
      // due to a store race condition, sometimes the connectionStatus is not "connected". Update it
      if (state.socketStatus.connectionStatus !== "connected") {
        state.socketStatus.connectionStatus = "connected";
      }
    },
    setSocketConnectionStatus: (state, action: { payload: ConnectionStatus }) => {
      state.socketStatus.connectionStatus = action.payload;
    },
    setLastEditEvent: (state, action: { payload: EditEvent }) => {
      state.socketStatus.lastEditEvent = action.payload;
    },
    setBrowserConnectionStatus: (state, action: { payload: ConnectionStatus }) => {
      state.browserConnectionStatus = action.payload;
    },
    setAppVersion: (state, action: { payload: AppVersion }) => {
      state.appVersion = action.payload;
    },
  },
});

export const {
  setLastStatusFromServer,
  setSocketConnectionStatus,
  setLastEditEvent,
  setBrowserConnectionStatus,
  setAppVersion,
} = connectionSlice.actions;

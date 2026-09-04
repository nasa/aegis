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
      databaseEpoch: null,
    },
  },
  browserConnectionStatus: "connected", // start connected because if the user has loaded the app, they have a browser connection.
  clientAppVersion: null,
  databaseEpochStale: false,
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
    setClientAppVersion: (state, action: { payload: AppVersion }) => {
      state.clientAppVersion = action.payload;
    },
    setServerVersion: (state, action: { payload: AppVersion }) => {
      state.socketStatus.lastStatusFromServer.serverVersion = action.payload;
    },
    /**
     * Marks the client's view of the mission data as stale because the
     * server has advanced to a new database epoch since this page was loaded.
     * Setting this to `true` renders the restore overlay in `App.tsx` and
     * schedules a page reload.
     */
    setDatabaseEpochStale: (state, action: { payload: boolean }) => {
      state.databaseEpochStale = action.payload;
    },
  },
});

export const {
  setLastStatusFromServer,
  setSocketConnectionStatus,
  setLastEditEvent,
  setBrowserConnectionStatus,
  setClientAppVersion,
  setServerVersion,
  setDatabaseEpochStale,
} = connectionSlice.actions;

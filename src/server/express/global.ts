export const globalValues: GlobalValues = {
  socketio: null,
  serverSocketStatus: {
    visitorsData: [],
    maestroVisitors: [], // Deprecated
    maestroMissionVisitors: {},
    lastEditEvents: {},
  },
  orm: null,
  socketInterval: null, // ensures only 1 interval is running
  appVersion: null,
  isEmssApiEnabled: true,
  automergeRepo: null,
  maestro: {
    socketio: null,
    docListeners: new Map(),
    docHandles: new Map(),
    evaSubscriptions: new Map(),
  },
};

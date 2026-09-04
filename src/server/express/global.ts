export const globalValues: GlobalValues = {
  socketio: null,
  serverSocketStatus: {
    visitorsData: [],
    lastEditEvents: {},
  },
  orm: null,
  socketInterval: null, // ensures only 1 interval is running
  appVersion: null,
  databaseEpoch: null,
  isEmssApiEnabled: true,
  automergeRepo: null,
  maestroV2: {
    visitorData: {},
    socketio: null,
    docListeners: new Map(),
    docHandles: new Map(),
    evaSubscriptions: new Map(),
  },
};

export const globalValues: GlobalValues = {
  socketio: null,
  serverSocketStatus: {
    visitorsData: [],
    maestroVisitors: [],
    lastEditEvents: {},
  },
  ormCache: null,
  socketInterval: null, // ensures only 1 interval is running
  appVersion: null,
  isEmssApiEnabled: true,
};

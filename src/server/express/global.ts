export const globalValues: GlobalValues = {
  socketio: null,
  serverSocketStatus: {
    visitorsData: [],
    maestroVisitors: [],
    lastEditEvents: {},
  },
  orm: null,
  socketInterval: null, // ensures only 1 interval is running
  appVersion: null,
  isEmssApiEnabled: true,
};

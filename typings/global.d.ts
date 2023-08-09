declare module globalThis {
  var __ormCache__: MikroORM<D>;
  var __socketio__: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
}

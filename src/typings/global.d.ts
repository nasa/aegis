type MikroORM = import("@mikro-orm/core").MikroORM;
type Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> =
  import("socket.io").Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;

type GlobalValues = {
  ormCache: MikroORM;
  socketio: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  serverSocketStatus: ServerSocketStatus;
  socketInterval: NodeJS.Timeout;
};

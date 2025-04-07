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
  appVersion: AppVersion;
};

// Client types. These are set in vite.config.mts at vite build time
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

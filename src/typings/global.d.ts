type MikroORM = import("@mikro-orm/core").MikroORM;
type Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData> =
  import("socket.io").Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    SocketData
  >;

type GlobalValues = {
  ormCache: MikroORM;
  socketio: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    import("socket.io/dist/typed-events").DefaultEventsMap,
    SocketData
  >;
  serverSocketStatus: ServerSocketStatus;
  socketInterval: NodeJS.Timeout;
  appVersion: AppVersion;
};

// Client types. These are set in vite.config.mts at vite build time
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

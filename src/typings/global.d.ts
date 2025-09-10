type MikroORM = import("@mikro-orm/postgresql").MikroORM;
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
    {}
  >;
  serverSocketStatus: ServerSocketStatus;
  socketInterval: NodeJS.Timeout;
  appVersion: AppVersion;
  isEmssApiEnabled: boolean;
};

// these are defined in esbuild.mjs and vite.config.mts
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

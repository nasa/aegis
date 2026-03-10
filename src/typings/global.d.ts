type MikroORM = import("@mikro-orm/postgresql").MikroORM;
type Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData> =
  import("socket.io").Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    SocketData
  >;

type Repo = import("@automerge/automerge-repo").Repo;
type DefaultEventsMap = import("socket.io").DefaultEventsMap;
type GlobalValues = {
  orm: MikroORM;
  socketio: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>;
  serverSocketStatus: ServerSocketStatus;
  socketInterval: NodeJS.Timeout;
  appVersion: AppVersion;
  isEmssApiEnabled: boolean;
  automergeRepo: Repo;
};

// these are defined in esbuild.mjs and vite.config.mts
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

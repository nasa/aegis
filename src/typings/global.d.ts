type MikroORM = import("@mikro-orm/postgresql").MikroORM;
type Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData> =
  import("socket.io").Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    SocketData
  >;
type Namespace<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> =
  import("socket.io").Namespace<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
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
  maestro: {
    socketio: Namespace<
      MaestroClientToServerEvents,
      MaestroServerToClientEvents,
      DefaultEventsMap,
      {}
    > | null;
    /**
     * Tracks active automerge "change" listeners for Maestro socket rooms.
     * Key is the socket room name.
     * Value is a function that removes the listener from the DocHandle.
     */
    docListeners: Map<string, () => void>;
    evaSubscriptions: Map<number, string[]>; // key is missionId, value is array of eva uuids subscribed to
  };
};

// these are defined in esbuild.mjs and vite.config.mts
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

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
    evaSubscriptions: Map<number, string[]>; // key is missionId, value is array of eva refUuids subscribed to
  };
};

// these are defined in esbuild.mjs and vite.config.mts
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

/**
 * Injected at build time by vite.config.mts via `define`. Holds the Vite
 * `base` (e.g. '/' or '/__BASE_URL__/'). Reading from this global — rather
 * than `import.meta.env.BASE_URL` directly — keeps modules that use the
 * base URL loadable by non-Vite contexts (Playwright transform, ts-node,
 * vitest under CJS). The literal `import.meta` syntax causes those loaders
 * to promote files to ESM and then fail on emitted `exports`. See
 * imago/docs/consumer-base-url-rewrite.md §6.
 */

declare const __VITE_BASE_URL__: string | undefined;

type MaestroVisitorV1 = import("server/maestro/v1/types/socketioMaestro").MaestroVisitor;
type MaestroVisitorV2 = import("server/maestro/v2/types/socketioMaestro").MaestroVisitor;
type MaestroClientToServerEventsV1 =
  import("server/maestro/v1/types/socketioMaestro").MaestroClientToServerEvents;
type MaestroServerToClientEventsV1 =
  import("server/maestro/v1/types/socketioMaestro").MaestroServerToClientEvents;
type MaestroClientToServerEventsV2 =
  import("server/maestro/v2/types/socketioMaestro").MaestroClientToServerEvents;
type MaestroServerToClientEventsV2 =
  import("server/maestro/v2/types/socketioMaestro").MaestroServerToClientEvents;

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
  socketioLegacy: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>;
  serverSocketStatus: ServerSocketStatus;
  socketInterval: NodeJS.Timeout;
  appVersion: AppVersion;
  isEmssApiEnabled: boolean;
  automergeRepo: Repo;
  maestroV1: {
    visitorData: { [missionId: string]: MaestroVisitorV1[] };
    socketio: Namespace<
      MaestroClientToServerEventsV1,
      MaestroServerToClientEventsV1,
      DefaultEventsMap,
      {}
    > | null;
    /**
     * Tracks active automerge "change" listeners for Maestro socket rooms.
     * Key is the missionId.
     * Value is a function that removes the listener from the DocHandle.
     */
    docListeners: Map<number, () => void>;
    /**
     * Cached automerge DocHandles for missions that Maestro is actively listening to.
     * Key is missionId. Populated by addMaestroDocListenerForMission, cleared by cleanupSocketRoom.
     * Used to avoid a DB round-trip on every isRelevantToSubscribedEvas check.
     */
    docHandles: Map<number, import("@automerge/automerge-repo").DocHandle<Mission>>;
    evaSubscriptions: Map<number, string[]>; // key is missionId, value is array of eva uuids subscribed to
  };
  maestroV2: {
    visitorData: { [missionId: string]: MaestroVisitorV2[] };
    socketio: Namespace<
      MaestroClientToServerEventsV2,
      MaestroServerToClientEventsV2,
      DefaultEventsMap,
      {}
    > | null;
    /**
     * Tracks active automerge "change" listeners for Maestro socket rooms.
     * Key is the missionId.
     * Value is a function that removes the listener from the DocHandle.
     */
    docListeners: Map<number, () => void>;
    /**
     * Cached automerge DocHandles for missions that Maestro is actively listening to.
     * Key is missionId. Populated by addMaestroDocListenerForMission, cleared by cleanupSocketRoom.
     * Used to avoid a DB round-trip on every isRelevantToSubscribedEvas check.
     */
    docHandles: Map<number, import("@automerge/automerge-repo").DocHandle<Mission>>;
    evaSubscriptions: Map<number, string[]>; // key is missionId, value is array of eva uuids subscribed to
  };
};

// these are defined in esbuild.mjs and vite.config.mts
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

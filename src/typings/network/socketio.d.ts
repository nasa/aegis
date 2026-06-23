declare type LaunchpadUser = import("@emss/oauth2-proxy-common").EmssUser;

// ─── Default namespace ("/") — Aegis web client ──────────────────────────────

interface ServerToClientEvents {
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: AppVersion) => void; // server version sent to client
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  storeUpsertForMaestro: (payload: StoreUpsertForMaestro) => void; // Deprecated - use Maestro namespace instead
  inspectorUpdate: (payload: ServerSocketStatus) => void;
}

interface ClientToServerEvents {
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  visitorJoin: (visitorData: VisitorData) => void;
  maestroJoin: (maestroVisitor: MaestroVisitor) => void; // Deprecated - use Maestro namespace instead
  inspectorJoin: () => void;
  getMaestroDebugInfo: (
    callback: (data: {
      docListenerMissionIds: number[];
      evaSubscriptions: { [missionId: number]: string[] };
    }) => void
  ) => void;
}

// ─── /maestro namespace — Maestro API client ─────────────────────────────────

interface MaestroServerToClientEvents {
  dataAll: (everythingForMaestro: Maegistro.IAegisEntity) => void;
}

interface MaestroClientToServerEvents {
  missionJoin: (missionId: number, maestroVisitor: MaestroVisitor) => void;
  missionLeave: (missionId: number) => void;
  subscribeToEva: (missionId: number, evaRefUuid: string, rexUuid: string | null) => void;
  unsubscribeToEva: (missionId: number, evaRefUuid: string, rexUuid: string | null) => void;
  getEverything: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: Maegistro.IAegisEntity }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  getMission: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: Mission[] }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  getReadableEva: (
    params: ReadableEvaParams,
    callback: (
      response:
        | {
            status: "success";
            message: string;
            data:
              | ExportEva[]
              | { uuid: string; refUuid: string; createdAt?: string; updatedAt?: string }[];
          }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  getMissions: (
    callback: (
      response:
        | { status: "success"; message: string; data: MissionsWithEvas }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  getRexesByEvaRef: (
    evaRefUuid: string,
    callback: (
      response:
        | { status: "success"; message: string; data: RefRex[] }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  rexOverwrite: (
    body: RexOverwrite,
    callback: (
      response:
        | { status: "success"; message: string; data: Rex[] }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
}

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting" | "failed";

// information stored in the client redux store about the socket status
interface ClientSocketStatus {
  connectionStatus: ConnectionStatus;
  lastEditEvent: EditEvent | null;
  lastStatusFromServer: StatusFromServer;
}

// information stored in the server's globalValues about the socket status
interface ServerSocketStatus {
  visitorsData: VisitorData[];
  maestroVisitors: MaestroVisitor[]; // Deprecated
  maestroMissionVisitors: { [missionId: string]: MaestroVisitor[] };
  lastEditEvents: EditEvents; // last edit events for all missions
}

// sent by client when joining and stored in server's globalValues
interface VisitorData {
  socketId: string; // identifier for managing the list on server global
  missionId: number;
  permission: "editor" | "viewer";
  clientAppVersion: AppVersion;
  appUser: AppUser;
  launchpadUser: LaunchpadUser;
  connectedAt: number; // timestamp when the visitor joined
}

// sent by maestro client when joining and stored in server's globalValues
interface MaestroVisitor {
  socketId: string; // identifier for managing the list on server global
  name: string; // name of the maestro server
  connectedAt: number; // timestamp when the maestro joined
}

interface VisitorCounts {
  editors: number;
  viewers: number;
}

interface StatusFromServer {
  visitorCounts: VisitorCounts;
  timestamp: number;
  serverVersion: AppVersion;
}

interface AppVersion {
  version: string;
  gitCommit: string;
}

interface EditEvent {
  socketId: string;
  type: SocketStoreType;
  datestamp: string;
}

interface EditEvents {
  [missionId: number]: EditEvent;
}

type SocketStoreType = "preset" | "stmRule" | "folder";
type StoreData = Preset | STMRule | Folder;

interface StoreUpsert {
  socketId: string;
  missionId: number;
  type: SocketStoreType;
  data: StoreData[];
  lastEditEvent: EditEvent;
}

interface StoreDelete {
  socketId: string;
  missionId: number;
  type: SocketStoreType;
  uuids: string[];
  lastEditEvent: EditEvent;
}

/**
 * @deprecated
 */
type StoreTypeForMaestro = "station" | "eva" | "action" | "traverse" | "rex";

/**
 * @deprecated
 */
type StoreDataForMaestro = ExportStation | ExportEva | ExportAction | ExportTraverse | ExportRex;

/**
 * @deprecated
 */
interface StoreUpsertForMaestro {
  socketId: string;
  missionId: number;
  type: StoreTypeForMaestro;
  data: StoreDataForMaestro[];
  lastEditEvent: EditEvent;
}

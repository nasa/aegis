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

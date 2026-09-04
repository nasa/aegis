declare type LaunchpadUser = import("@emss/oauth2-proxy-common").EmssUser;

// ─── Default namespace ("/") — Aegis web client ──────────────────────────────

interface ServerToClientEvents {
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: RuntimeVersion) => void; // server version sent to client
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  inspectorUpdate: (payload: ServerSocketStatus) => void;
}

interface ClientToServerEvents {
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  visitorJoin: (visitorData: VisitorData) => void;
  inspectorJoin: () => void;
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
  /** Server's current database epoch. Clients compare this against the epoch
   * accepted at page load; a mismatch triggers an automatic reload. */
  databaseEpoch: string;
}

interface AppVersion {
  version: string;
  gitCommit: string;
}

/**
 * Extends `AppVersion` with the server's current database epoch.
 * Sent to the client on the `version` socket event (emitted on connection)
 * so the client can detect an epoch change the moment it reconnects after
 * a database restore.
 */
interface RuntimeVersion extends AppVersion {
  databaseEpoch: string;
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

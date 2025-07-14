declare type LaunchpadUser = import("@emss/oauth2-proxy-common").EmssUser;

/** Socket.io Server instantiation types */
interface ServerToClientEvents {
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: AppVersion) => void; // server version sent to client
}

interface ClientToServerEvents {
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  visitorJoin: (visitorData: VisitorData) => void;
}

interface SocketData {
  name: string;
  age: number;
}
/** */

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

interface EditEvent {
  socketId: string;
  type: StoreType;
  datestamp: string;
}

interface EditEvents {
  [missionId: number]: EditEvent;
}

type StoreType =
  | "preset"
  | "poi"
  | "station"
  | "eva"
  | "action"
  | "traverse"
  | "mission"
  | "rex"
  | "stmRule"
  | "folder";

type StoreUpsertDataTypes =
  | POI
  | Preset
  | Station
  | Eva
  | Action
  | Traverse
  | Mission
  | Rex
  | STMRule
  | Folder;

interface StoreUpsert {
  socketId: string;
  missionId: number;
  type: StoreType;
  data: StoreUpsertDataTypes[];
  lastEditEvent: EditEvent;
}

interface StoreDelete {
  socketId: string;
  missionId: number;
  type: StoreType;
  uuids: string[];
  lastEditEvent?: EditEvent;
}

// sent by client when joining and stored in server's globalValues
interface VisitorData {
  socketId: string; // identifier for managing the list on server global
  missionId: number;
  permission: "editor" | "viewer";
  appVersion: AppVersion;
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

declare type LaunchpadUser = import("@emss/oauth2-proxy-common").EmssUser;

/** Socket.io Server instantiation types */
interface ServerToClientEvents {
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: AppVersion) => void; // server version sent to client
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  storeUpsertForMaestro: (payload: StoreUpsertForMaestro) => void;
  storeDeleteForMaestro: (payload: StoreDeleteForMaestro) => void;
  inspectorUpdate: (payload: ServerSocketStatus) => void;
}

interface ClientToServerEvents {
  storeUpsert: (payload: StoreUpsert) => void;
  storeDelete: (payload: StoreDelete) => void;
  visitorJoin: (visitorData: VisitorData) => void;
  maestroJoin: (maestroVisitor: MaestroVisitor) => void;
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
  maestroVisitors: MaestroVisitor[];
  lastEditEvents: EditEvents; // last edit events for all missions
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

type SocketStoreType =
  | "preset"
  | "poi"
  | "station"
  | "eva"
  | "action"
  | "traverse"
  | "rex"
  | "stmRule"
  | "folder";

type StoreData = POI | Preset | Station | Eva | Action | Traverse | Rex | STMRule | Folder;

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

type StoreTypeForMaestro = "station" | "eva" | "action" | "traverse" | "rex";

type StoreDataForMaestro = ExportStation | ExportEva | ExportAction | ExportTraverse | ExportRex;

interface StoreUpsertForMaestro {
  socketId: string;
  missionId: number;
  type: StoreTypeForMaestro;
  data: StoreDataForMaestro[];
  lastEditEvent: EditEvent;
}

interface StoreDeleteForMaestro {
  socketId: string;
  missionId: number;
  type: StoreTypeForMaestro;
  refUuids: string[];
  lastEditEvent: EditEvent;
}

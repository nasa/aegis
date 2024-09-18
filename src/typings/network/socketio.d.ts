/** Socket.io Server instantiation types */
interface ServerToClientEvents {
  noArg: () => void;
  storeUpsert: (
    payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission | Rex>
  ) => void;
  storeDelete: (payload: StoreDelete) => void;
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: string) => void;
}

interface ClientToServerEvents {
  storeUpsert: (
    payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission | Rex>
  ) => void;
  storeDelete: (payload: StoreDelete) => void;
  visitorJoin: (visitorJoin: VisitorJoin) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  age: number;
}
/** */

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting";

interface SocketStatus {
  connectionStatus: ConnectionStatus;
  lastEditEvent: EditEvent | null;
  lastStatusFromServer: StatusFromServer;
  AEGISVersion: string;
}

interface ServerSocketStatus {
  visitorsData: VisitorData[];
  lastEditEvents: EditEvents;
}

interface EditEvent {
  socketId: string;
  type: StoreType;
  datestamp: string;
}

interface EditEvents {
  [missionId: number]: EditEvent;
}

type StoreType = "preset" | "poi" | "station" | "eva" | "action" | "traverse" | "mission" | "rex";

interface StoreUpsert<T> {
  socketId: string;
  missionId: number;
  type: StoreType;
  data: T[];
  lastEditEvent: EditEvent;
}

interface StoreDelete {
  socketId: string;
  missionId: number;
  type: StoreType;
  uuids: string[];
  lastEditEvent?: EditEvent;
}

interface VisitorJoin {
  socketId: string;
  missionId: number;
  type: "editor" | "viewer";
}

interface VisitorData {
  socketId: string;
  missionId: number;
  type: "editor" | "viewer";
}

interface VisitorCounts {
  editors: number;
  viewers: number;
}

interface StatusFromServer {
  visitorCounts: VisitorCounts;
  timestamp: number;
}

interface SessionData {
  user?: User;
}

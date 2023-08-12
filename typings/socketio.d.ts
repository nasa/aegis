/** Socket.io Server instantiation types */
interface ServerToClientEvents {
  noArg: () => void;
  storeUpsert: (payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => void;
  storeDelete: (payload: StoreDelete) => void;
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: string) => void;
}

interface ClientToServerEvents {
  storeUpsert: (payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => void;
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
  visitorCounts: visitorCounts;
  connectionStatus: ConnectionStatus;
  lastEditEvent: EditEvent | null;
}

interface ServerSocketStatus {
  visitorsData: VisitorData[];
  lastEditEvents: EditEvents;
}

interface EditEvent {
  uniqueClientId: string;
  type: StoreType;
  datestamp: string;
}

interface EditEvents {
  [missionId: number]: EditEvent;
}

type StoreType = "preset" | "poi" | "station" | "eva" | "action" | "traverse";

interface StoreUpsert<T> {
  uniqueClientId: string;
  missionId: number;
  type: StoreType;
  data: T[];
  lastEditEvent?: EditEvent;
}

interface StoreDelete {
  uniqueClientId: string;
  missionId: number;
  type: StoreType;
  uuid: string;
  lastEditEvent?: EditEvent;
}

interface VisitorJoin {
  uniqueClientId: string;
  missionId: number;
  type: "editor" | "viewer";
}

interface VisitorData {
  socketId: string;
  uniqueClientId: string;
  missionId: number;
  type: "editor" | "viewer";
}

interface VisitorCounts {
  editors: number;
  viewers: number;
}

interface StatusFromServer {
  visitorCounts: VisitorCounts;
}

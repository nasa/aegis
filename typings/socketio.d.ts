/** Socket.io Server instantiation types */
interface ServerToClientEvents {
  noArg: () => void;
  storeUpsert: (payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => void;
  storeDelete: (payload: StoreDelete) => void;
  visitorCounts: (VisitorCounts: VisitorCounts) => void;
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
}

type StoreType = "preset" | "poi" | "station" | "eva" | "action" | "traverse";

interface StoreUpsert<T> {
  uniqueClientId: string;
  missionId: number;
  type: StoreType;
  data: T[];
}

interface StoreDelete {
  uniqueClientId: string;
  missionId: number;
  type: StoreType;
  uuid: string;
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

type TimestampCheck = {
  uuid: string;
  updatedAt: string;
};

interface StoreTimestampAudit {
  type: StoreType;
  timestampChecks: TimestampCheck[];
}

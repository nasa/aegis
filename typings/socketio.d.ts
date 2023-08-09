/** Socket.io Server instantiation types */
interface ServerToClientEvents {
  noArg: () => void;
  message: (message: string) => void;
  storeUpsert: (payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => void;
  storeDelete: (payload: StoreDelete) => void;
  clientCount: (count: number) => void;
}

interface ClientToServerEvents {
  message: (message: string) => void;
  storeUpsert: (payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => void;
  storeDelete: (payload: StoreDelete) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  age: number;
}
/** */

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

type TimestampCheck = {
  uuid: string;
  updatedAt: string;
};

interface StoreTimestampAudit {
  type: StoreType;
  timestampChecks: TimestampCheck[];
}

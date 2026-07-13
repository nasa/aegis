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
  sendMDAU: (missionId: number, mdau: MaestroDataAegisUses) => void;
  // Mimics the api/v1/mission route
  getMission: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: Mission[] }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  // Mimics the api/v1/readable/eva route
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
  // Mimics the emss/getMissions route
  getMissions: (
    callback: (
      response:
        | { status: "success"; message: string; data: MissionsWithEvas }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  // Mimics the emss/getRexesByEvaRef route
  getRexesByEvaRef: (
    evaRefUuid: string,
    callback: (
      response:
        | { status: "success"; message: string; data: RefRex[] }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  // Mimics the emss/rexOverwrite route
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

// sent by maestro client when joining and stored in server's globalValues
interface MaestroVisitor {
  socketId: string; // identifier for managing the list on server global
  name: string; // name of the maestro server
  connectedAt: number; // timestamp when the maestro joined
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

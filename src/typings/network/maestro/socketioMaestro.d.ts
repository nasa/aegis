// ─── /maestro namespace — Maestro API client ─────────────────────────────────

interface MaestroServerToClientEvents {
  // Maegistro V1.5 & V2 - in progress
  dataAll: (everythingForMaestro: Maegistro.AegisSlice) => void;
}

interface MaestroClientToServerEvents {
  // Maegistro V1.5 only
  missionJoin: (missionId: number, maestroVisitor: MaestroVisitor) => void;
  // Maegistro V1.5 & V2 - in progress
  missionLeave: (missionId: number) => void;
  subscribeToEva: (missionId: number, evaRefUuid: string, rexUuid: string | null) => void;
  unsubscribeToEva: (missionId: number, evaRefUuid: string, rexUuid: string | null) => void;
  getEverything: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: Maegistro.AegisSlice }
        | { status: "failure"; message: string }
        | { status: "error"; message: string }
    ) => void
  ) => void;

  // Maegistro V2 - in progress
  sendMDAU: (missionId: number, mdau: Maegistro.MaestroDataAegisUses) => void;
  missionJoin2: (missionId: number, maestroVisitor: MaestroVisitor) => void;

  // Maegistro V1.5
  // Mimics the emss/rexOverwrite route
  // Deprecated in favor of sendMDAU. Used for Maegistro V1.5 currently
  // but this is a known signature that will be removed in the future
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

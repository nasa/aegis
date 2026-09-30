// ─── /maestro namespace — Maestro API client ─────────────────────────────────

import type { AegisSlice } from "./aegisSlice";
import type { MDAU } from "./mdau";

export interface MaestroServerToClientEvents {
  dataAll: (everythingForMaestro: AegisSlice.AegisSlice) => void;
}

export interface MaestroClientToServerEvents {
  missionJoin: (
    missionId: number,
    maestroVisitor: MaestroVisitor,
    callback?: (
      response: { status: "success"; message: string } | { status: "error"; message: string }
    ) => void
  ) => void;
  missionLeave: (missionId: number) => void;
  subscribeToEva: (
    missionId: number,
    evaUuid: string,
    callback?: (response: { status: "success" } | { status: "error"; message: string }) => void
  ) => void;
  unsubscribeToEva: (missionId: number, evaUuid: string) => void;
  getEverything: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: AegisSlice.AegisSlice }
        | { status: "error"; message: string }
    ) => void
  ) => void;
  sendMDAU: (
    missionId: number,
    mdau: MDAU.MaestroDataAegisUses,
    callback?: (response: { status: "success" } | { status: "error"; message: string }) => void
  ) => void;
  getExecuteUuids: (
    missionId: number,
    rexUuid: string,
    callback: (
      response:
        | { status: "success"; executeUuidMap: ExecuteUuidMap }
        | { status: "error"; message: string }
    ) => void
  ) => void;

  getDebugInfo: (callback: (data: MaestroVersionDebugInfo) => void) => void;
}

export interface MaestroVersionDebugInfo {
  docListenerMissionIds: number[];
  evaSubscriptions: { [missionId: number]: string[] };
  visitors: { [missionId: string]: MaestroVisitorDebugEntry[] };
}

export interface MaestroVisitorDebugEntry {
  socketId: string;
  name: string;
  connectedAt: number;
}

// sent by maestro client when joining and stored in server's globalValues
export interface MaestroVisitor {
  socketId: string; // identifier for managing the list on server global
  name: string; // name of the maestro server
  connectedAt: number; // timestamp when the maestro joined
}

export interface ExecuteUuidMap {
  eva: { [oldEvaUuid: string]: string }; // new eva uuid
  station: { [oldStationUuid: string]: string }; // new station uuid
  traverse: { [oldTraverseUuid: string]: string }; // new traverse uuid
  action: { [oldActionUuid: string]: string }; // new action uuid
}

// ─── /maestro namespace — Maestro API client ─────────────────────────────────

import type { AegisSlice } from "./aegisSlice";

export interface MaestroServerToClientEvents {
  dataAll: (everythingForMaestro: AegisSlice.AegisSlice) => void;
}

export interface MaestroClientToServerEvents {
  missionJoin: (missionId: number, maestroVisitor: MaestroVisitor) => void;
  missionLeave: (missionId: number) => void;
  subscribeToEva: (missionId: number, evaRefUuid: string, rexUuid: string | null) => void;
  unsubscribeToEva: (missionId: number, evaRefUuid: string, rexUuid: string | null) => void;
  getEverything: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: AegisSlice.AegisSlice }
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

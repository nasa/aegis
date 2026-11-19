// ─── /dust namespace — DUST API client ────────────────────────────────────────

import type { DefaultEventsMap, Socket } from "socket.io";

export interface DustServerToClientEvents {
  /**
   * Sent whenever anything in a running REX's payload changes — crew position
   * adds/edits/deletes, pos type/source renames, and mission/REX/EVA renames.
   * Only emitted to the room for the mission the REX belongs to.
   */
  posEntriesUpdate: (payload: DustPosEntriesUpdate) => void;
}

/** A socket connected to the /dust/v1 namespace. */
export type DustSocket = Socket<
  DustClientToServerEvents,
  DustServerToClientEvents,
  DefaultEventsMap,
  {}
>;

export interface DustClientToServerEvents {
  missionJoin: (
    missionId: number,
    dustVisitor: DustVisitor,
    callback?: (
      response: { status: "success"; message: string } | { status: "error"; message: string }
    ) => void
  ) => void;

  /**
   * On-demand full resynchronization. Returns the current state of every REX on
   * the mission — running or not — each in the same shape as a `posEntriesUpdate`
   * payload.
   */
  getEverything: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: DustPosEntriesUpdate[] }
        | { status: "error"; message: string }
    ) => void
  ) => void;

  /** Lists every REX on the mission with its EVA. Does not require `missionJoin`. */
  getRexEvas: (
    missionId: number,
    callback: (
      response:
        | { status: "success"; message: string; data: DustRexEva[] }
        | { status: "error"; message: string }
    ) => void
  ) => void;

  /**
   * Returns the current crew positions for a single REX, in the same shape as a
   * `posEntriesUpdate` payload. Does not require `missionJoin`.
   */
  getPosEntries: (
    missionId: number,
    rexUuid: string,
    callback: (
      response:
        | { status: "success"; message: string; data: DustPosEntriesUpdate }
        | { status: "error"; message: string }
    ) => void
  ) => void;

  getDebugInfo: (callback: (data: DustDebugInfo) => void) => void;
}

/** One entry in the `GET /api/v1/dust/v1/getMissions` response. */
export interface DustMissionListItem {
  missionId: number;
  missionName: string;
}

export interface DustRexEva {
  evaName: string; // name of the as-planned EVA the REX was created from
  evaUuid: string; // uuid of the REX's own EVA copy
  rexName: string;
  rexUuid: string;
}

/**
 * A single crew position (POS) entry in a human-readable form for DUST — the
 * pos type and pos source uuids are resolved to their plain-text names.
 */
export interface DustReadablePosEntry {
  uuid: string;
  latlng: AEGISPoint;
  petSeconds: number;
  posTypes: string[]; // plain-text pos type names, e.g. "EV1"
  posSource: string; // plain-text pos source name
  createdAt: number;
  updatedAt: number;
}

export interface DustPosEntriesUpdate {
  missionId: number;
  missionName: string;
  rexUuid: string;
  rexName: string;
  evaUuid: string;
  evaName: string;
  // Always the full current list of crew positions for the rex, not just the
  // entry that changed.
  posEntries: DustReadablePosEntry[];
}

export interface DustDebugInfo {
  visitors: DustVisitorDebugEntry[];
  docListenerMissionIds: number[];
}

export interface DustVisitorDebugEntry {
  socketId: string;
  name: string;
  connectedAt: number;
  missionIds: number[];
}

// sent by the DUST client in missionJoin
export interface DustVisitor {
  socketId: string; // ignored by the server, which uses the socket's own id
  name: string; // name of the DUST server
  connectedAt: number; // ignored by the server, which records the connection time
}

// a connected DUST socket, tracked in server's globalValues from connection until disconnect
export interface DustVisitorData {
  socketId: string;
  name: string; // "unknown" until the first missionJoin supplies it
  connectedAt: number; // timestamp when the socket connected
  missionIds: number[]; // missions joined with missionJoin
}

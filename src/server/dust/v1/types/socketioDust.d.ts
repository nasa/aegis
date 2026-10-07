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

  getDebugInfo: (callback: (data: DustDebugInfo) => void) => void;
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
  visitors: { [missionId: string]: DustVisitorDebugEntry[] };
  docListenerMissionIds: number[];
}

export interface DustVisitorDebugEntry {
  socketId: string;
  name: string;
  connectedAt: number;
}

// sent by the DUST client when joining and stored in server's globalValues
export interface DustVisitor {
  socketId: string; // identifier for managing the list on server global
  name: string; // name of the DUST server
  connectedAt: number; // timestamp when DUST joined
}

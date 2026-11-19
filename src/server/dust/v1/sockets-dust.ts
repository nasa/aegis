/**
 * /dust namespace — DUST API client connections
 *
 * Mounted on the /api/socket Socket.IO server. Auth is enforced once at
 * connection time via namespace middleware. All handlers in this file can
 * assume the socket is DUST-authenticated.
 */
import { serverLogger } from "utils/logging/serverLogger";
import remove from "lodash/remove";
import { RequestContext } from "@mikro-orm/postgresql";
import type { DefaultEventsMap, Server } from "socket.io";
import { globalValues } from "../../express/global";
import { dustTokenIsValid, emssTokenIsValid } from "utils/permissions";
import {
  addDustDocListenerForMission,
  getEverythingForDust,
  getPosEntriesForDust,
  getRexEvasForDust,
  cleanupDust,
} from "./sockets-dust-emitters";
import type {
  DustClientToServerEvents,
  DustDebugInfo,
  DustServerToClientEvents,
  DustSocket,
  DustVisitor,
  DustVisitorDebugEntry,
} from "./types/socketioDust";

export const setupDustNamespace = (
  io: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>
): void => {
  // Cast to Dust-specific types — io.of() inherits the server's generic types by default,
  // but the /dust namespace has its own distinct event interfaces.
  const dustNamespace = io.of("/dust/v1") as unknown as Namespace<
    DustClientToServerEvents,
    DustServerToClientEvents,
    DefaultEventsMap,
    {}
  >;
  globalValues.dustV1.socketio = dustNamespace;

  // ── Auth middleware ───────────────────────────────────────────────────────
  // Runs once per connection attempt. Rejects the socket before any events
  // fire if neither a valid DUST token nor the EMSS master token is supplied.
  dustNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!dustTokenIsValid(token) && !emssTokenIsValid(token)) {
      serverLogger.warning({
        logId: "socket-dust-v1:authMiddleware:rejectedConnectionInvalidDustOrEmssToken",
        logValue: "Dust v1 namespace: rejected connection, invalid dustToken",
      });
      next(new Error("Unauthorized"));
      return;
    }
    next();
  });

  // ── Connection handler ────────────────────────────────────────────────────
  dustNamespace.on("connection", (socket: DustSocket) => {
    // Track the visitor from connection so query-only clients are visible too
    globalValues.dustV1.visitorData[socket.id] = {
      socketId: socket.id,
      name: "unknown",
      connectedAt: Date.now(),
      missionIds: [],
    };
    emitInspectorUpdate();

    socket.on("missionJoin", async (missionId: number, dustVisitor: DustVisitor, callback) => {
      const visitor = globalValues.dustV1.visitorData[socket.id];
      if (dustVisitor?.name) visitor.name = dustVisitor.name;

      if (!missionId || isNaN(missionId)) {
        serverLogger.warning({
          logId: "socket-dust-v1:missionJoin:rejectedInvalidMissionId",
          dustName: visitor.name,
          logValue: `missionJoin - invalid missionId ${missionId}`,
        });
        callback?.({ status: "error", message: `Invalid missionId ${missionId}` });
        return;
      }

      const roomName = getDustSocketRoomName(missionId);
      socket.join(roomName);
      if (!visitor.missionIds.includes(missionId)) visitor.missionIds.push(missionId);

      // Attach automerge listener for this mission if not already attached
      // The listener will be removed when the last dust visitor for this mission leaves
      try {
        await addDustDocListenerForMission(missionId);
      } catch (error) {
        // Setup failed — undo the join so the client isn't left in a room that
        // will never emit, and so a retry starts from a clean slate.
        removeDustVisitorFromMission(socket.id, missionId);
        socket.leave(roomName);
        emitInspectorUpdate();
        serverLogger.error(
          {
            logId: "socket-dust-v1:missionJoin:failedToAttachDocListenerJoinRolledBack",
            dustName: visitor.name,
            logValue: `missionJoin - failed to attach doc listener for mission ${missionId}`,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        callback?.({
          status: "error",
          message: `Failed to join mission ${missionId}`,
        });
        return;
      }

      emitInspectorUpdate();
      callback?.({ status: "success", message: `Joined mission ${missionId}` });
    });

    // Full resync — every rex on the mission in posEntriesUpdate payload form
    socket.on("getEverything", async (missionId: number, callback) => {
      if (!missionId || isNaN(missionId)) {
        serverLogger.warning({
          logId: "socket-dust-v1:getEverything:rejectedInvalidMissionId",
          logValue: `getEverything - invalid missionId ${missionId}`,
        });
        callback({ status: "error", message: `Invalid missionId ${missionId}` });
        return;
      }

      try {
        const data = await RequestContext.create(globalValues.orm.em, () =>
          getEverythingForDust(missionId)
        );
        callback({ status: "success", message: "Everything retrieved", data });
      } catch (error) {
        serverLogger.error(
          {
            logId: "socket-dust-v1:getEverything:failedToBuildFullResyncPayload",
            logValue: `getEverything - Error getting everything for mission ${missionId}`,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        callback({ status: "error", message: `Error getting everything ${error}` });
      }
    });

    // Every rex on the mission with its EVA
    socket.on("getRexEvas", async (missionId: number, callback) => {
      if (!missionId || isNaN(missionId)) {
        serverLogger.warning({
          logId: "socket-dust-v1:getRexEvas:rejectedInvalidMissionId",
          logValue: `getRexEvas - invalid missionId ${missionId}`,
        });
        callback({ status: "error", message: `Invalid missionId ${missionId}` });
        return;
      }

      try {
        const data = await getRexEvasForDust(missionId);
        callback({ status: "success", message: "Rex EVAs retrieved", data });
      } catch (error) {
        serverLogger.error(
          {
            logId: "socket-dust-v1:getRexEvas:failedToListRexEvasForMission",
            logValue: `getRexEvas - Error listing rex EVAs for mission ${missionId}`,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        callback({ status: "error", message: `Error getting rex EVAs ${error}` });
      }
    });

    // Current posEntries for a single rex
    socket.on("getPosEntries", async (missionId: number, rexUuid: string, callback) => {
      if (!missionId || isNaN(missionId) || !rexUuid || typeof rexUuid !== "string") {
        serverLogger.warning({
          logId: "socket-dust-v1:getPosEntries:rejectedInvalidMissionIdOrRexUuid",
          logValue: `getPosEntries - invalid missionId ${missionId} or rexUuid ${rexUuid}`,
        });
        callback({
          status: "error",
          message: `Invalid missionId ${missionId} or rexUuid ${rexUuid}`,
        });
        return;
      }

      try {
        const data = await getPosEntriesForDust(missionId, rexUuid);
        if (!data) {
          callback({
            status: "error",
            message: `Rex ${rexUuid} not found on mission ${missionId}`,
          });
          return;
        }
        callback({ status: "success", message: "Pos entries retrieved", data });
      } catch (error) {
        serverLogger.error(
          {
            logId: "socket-dust-v1:getPosEntries:failedToBuildPosEntriesForRex",
            logValue: `getPosEntries - Error getting pos entries for rex ${rexUuid} on mission ${missionId}`,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        callback({ status: "error", message: `Error getting pos entries ${error}` });
      }
    });

    // Summary of Dust information for the admin inspector
    socket.on("getDebugInfo", (callback) => {
      callback(buildDebugInfo());
    });

    socket.on("disconnect", () => {
      removeDustVisitor(socket.id);
      emitInspectorUpdate();
    });
  });
};

// Update the inspector room on the default namespace
const emitInspectorUpdate = (): void => {
  globalValues.socketio?.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
};

/** Whether any connected DUST visitor has joined the mission. */
export const hasDustVisitorsForMission = (missionId: number): boolean =>
  Object.values(globalValues.dustV1.visitorData).some((visitor) =>
    visitor.missionIds.includes(missionId)
  );

/**
 * Removes a mission from a visitor's joined missions.
 * Cleans up the dust state for the mission once no visitor has it joined.
 */
export const removeDustVisitorFromMission = (socketId: string, missionId: number): void => {
  const visitor = globalValues.dustV1.visitorData[socketId];
  if (!visitor) return;

  const removed = remove(visitor.missionIds, (id) => id === missionId);
  if (removed.length > 0 && !hasDustVisitorsForMission(missionId)) {
    cleanupDust(missionId);
  }
};

/**
 * Stops tracking a visitor and cleans up every mission it was the last visitor of.
 */
export const removeDustVisitor = (socketId: string): void => {
  const visitor = globalValues.dustV1.visitorData[socketId];
  if (!visitor) return;

  delete globalValues.dustV1.visitorData[socketId];
  for (const missionId of visitor.missionIds) {
    if (!hasDustVisitorsForMission(missionId)) cleanupDust(missionId);
  }
};

/**
 * Summary information of the Dust information from global
 * Used in the admin page inspector
 */
export const buildDebugInfo = (): DustDebugInfo => {
  const slice = globalValues.dustV1;
  const visitors: DustVisitorDebugEntry[] = Object.values(slice.visitorData).map((v) => ({
    socketId: v.socketId,
    name: v.name,
    connectedAt: v.connectedAt,
    missionIds: [...v.missionIds],
  }));
  const docListenerMissionIds = Array.from(slice.docListeners.keys());
  return { visitors, docListenerMissionIds };
};

/**
 * One liner function to unify where the room name string is built for the dust namespace
 * This is for consistency and to avoid hardcoding the room name string in multiple places
 * @param missionId
 * @returns
 */
export const getDustSocketRoomName = (missionId: number): string => {
  return `dust${missionId}`;
};
export const getMissionIdFromDustSocketRoomName = (roomName: string): number | null => {
  const match = roomName.match(/^dust(\d+)$/);
  if (match) {
    return parseInt(match[1]);
  }
  return null;
};

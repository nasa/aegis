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
        logId: "socket-dust-v1",
        logValue: "Dust v1 namespace: rejected connection, invalid dustToken",
      });
      next(new Error("Unauthorized"));
      return;
    }
    next();
  });

  // ── Connection handler ────────────────────────────────────────────────────
  dustNamespace.on("connection", (socket: DustSocket) => {
    socket.on("missionJoin", async (missionId: number, dustVisitor: DustVisitor, callback) => {
      if (!missionId || isNaN(missionId)) {
        serverLogger.warning({
          logId: "socket-dust-v1",
          dustName: dustVisitor?.name || "unknown",
          logValue: `missionJoin - invalid missionId ${missionId}`,
        });
        callback?.({ status: "error", message: `Invalid missionId ${missionId}` });
        return;
      }

      const roomName = getDustSocketRoomName(missionId);
      socket.join(roomName);

      // Add this dust visitor to the server's global under the mission room
      if (!globalValues.dustV1.visitorData[missionId]) {
        globalValues.dustV1.visitorData[missionId] = [];
      }
      const dustVisitors = globalValues.dustV1.visitorData[missionId];
      // Set this visitor's information on the server's global
      // Remove this socket from tracking list if it exists and push the new one
      remove(dustVisitors, (item) => {
        return item.socketId === socket.id;
      });
      dustVisitor.socketId = socket.id;
      dustVisitors.push(dustVisitor);

      // Attach automerge listener for this mission if not already attached
      // The listener will be removed when the last dust visitor for this mission disconnects
      try {
        await addDustDocListenerForMission(missionId);
      } catch (error) {
        // Setup failed — undo the join so the client isn't left in a room that
        // will never emit, and so a retry starts from a clean slate.
        removeDustVisitor(socket.id, missionId);
        socket.leave(roomName);
        globalValues.socketio
          .to("inspector")
          .emit("inspectorUpdate", globalValues.serverSocketStatus);
        serverLogger.error(
          {
            logId: "socket-dust-v1",
            dustName: dustVisitor?.name || "unknown",
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

      // Update the inspector room on the default namespace
      globalValues.socketio
        .to("inspector")
        .emit("inspectorUpdate", globalValues.serverSocketStatus);

      callback?.({ status: "success", message: `Joined mission ${missionId}` });
    });

    // Full resync — every rex on the mission in posEntriesUpdate payload form
    socket.on("getEverything", async (missionId: number, callback) => {
      if (!missionId || isNaN(missionId)) {
        serverLogger.warning({
          logId: "socket-dust-v1",
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
            logId: "socket-dust-v1",
            logValue: `getEverything - Error getting everything for mission ${missionId}`,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        callback({ status: "error", message: `Error getting everything ${error}` });
      }
    });

    // Summary of Dust information for the admin inspector
    socket.on("getDebugInfo", (callback) => {
      callback(buildDebugInfo());
    });

    socket.on("disconnect", () => {
      // Remove this socket from any dust mission rooms they happened to be in
      for (const missionId in globalValues.dustV1.visitorData) {
        removeDustVisitor(socket.id, +missionId);
      }

      // Update the inspector room on the default namespace
      globalValues.socketio
        .to("inspector")
        .emit("inspectorUpdate", globalValues.serverSocketStatus);
    });
  });
};

/**
 * Removes a socket from a mission's visitor list
 * Cleans up the dust state once the last visitor is gone.
 */
export const removeDustVisitor = (socketId: string, missionId: number): void => {
  const visitors = globalValues.dustV1.visitorData[missionId];
  if (!visitors) return;

  const removed = remove(visitors, (item) => item.socketId === socketId);
  // If we removed the last visitor and the room is now empty, delete the key and cleanup
  if (removed.length > 0 && visitors.length === 0) {
    delete globalValues.dustV1.visitorData[missionId];
    cleanupDust(missionId);
  }
};

/**
 * Summary information of the Dust information from global
 * Used in the admin page inspector
 */
export const buildDebugInfo = (): DustDebugInfo => {
  const slice = globalValues.dustV1;
  const visitors: { [missionId: string]: DustVisitorDebugEntry[] } = {};
  for (const missionId in slice.visitorData) {
    visitors[missionId] = (slice.visitorData[missionId] ?? []).map((v) => ({
      socketId: v.socketId,
      name: v.name,
      connectedAt: v.connectedAt,
    }));
  }
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

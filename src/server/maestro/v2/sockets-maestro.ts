/**
 * /maestro/v2 namespace — Maegistro v2 API client connections
 *
 * Mounted on the new /api/socket Socket.IO server. Auth is enforced once at
 * connection time via namespace middleware. All handlers in this file can
 * assume the socket is EMSS-authenticated.
 *
 * Fully isolated from v1 — imports only from `server/maestro/v2/*`.
 */
import { serverLogger } from "utils/logging/serverLogger";
import remove from "lodash/remove";
import type { DefaultEventsMap, Server, Socket } from "socket.io";
import { RequestContext } from "@mikro-orm/postgresql";
import { globalValues } from "../../express/global";
import {
  addMaestroDocListenerForMission,
  applyMdauStationsToDoc,
  buildDebugInfo,
  cleanupMaestro,
  removeEvaFromSubscriptions,
} from "server/maestro/v2/sockets-maestro-emitters";
import { emssTokenIsValid } from "utils/permissions";
import { buildAegisSliceForMaestro } from "server/maestro/v2/maestro";
import { getAutomergeMissions } from "server/express/routes/missionAutomerge";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import type {
  MaestroClientToServerEvents,
  MaestroServerToClientEvents,
  MaestroVisitor,
} from "./types/socketioMaestro";
import type { MDAU } from "./types/mdau";

export const setupMaestroNamespace = (
  io: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>
): void => {
  // Cast to Maestro-specific types — io.of() inherits the server's generic types by default,
  // but the /maestro/v2 namespace has its own distinct event interfaces.
  const maestroNamespace = io.of("/maestro/v2") as unknown as Namespace<
    MaestroClientToServerEvents,
    MaestroServerToClientEvents,
    DefaultEventsMap,
    {}
  >;
  globalValues.maestroV2.socketio = maestroNamespace;

  // ── Auth middleware ───────────────────────────────────────────────────────
  // Runs once per connection attempt. Rejects the socket before any events
  // fire if the EMSS token is missing or invalid.
  maestroNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!emssTokenIsValid(token)) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: "Maestro v2 namespace: rejected connection, invalid emssToken",
      });
      next(new Error("Unauthorized"));
      return;
    }
    next();
  });

  // ── Connection handler ────────────────────────────────────────────────────
  maestroNamespace.on(
    "connection",
    (
      socket: Socket<MaestroClientToServerEvents, MaestroServerToClientEvents, DefaultEventsMap, {}>
    ) => {
      socket.on("missionJoin", (missionId: number, maestroVisitor: MaestroVisitor) => {
        if (!missionId || isNaN(missionId)) {
          serverLogger.warning({
            logId: "socket-maestro-v2",
            logValue: `missionJoin - invalid missionId ${missionId}`,
          });
          return;
        }

        const roomName = getMaestroSocketRoomName(missionId);
        socket.join(roomName);

        // Add this maestro visitor to the server's global under the mission room
        if (!globalValues.maestroV2.visitorData[missionId]) {
          globalValues.maestroV2.visitorData[missionId] = [];
        }
        const maestroVisitors = globalValues.maestroV2.visitorData[missionId];
        // Set this visitor's information on the server's global
        // Remove this socket from tracking list if it exists and push the new one
        remove(maestroVisitors, (item) => {
          return item.socketId === socket.id;
        });
        maestroVisitor.socketId = socket.id;
        maestroVisitors.push(maestroVisitor);

        // Attach automerge listener for this mission if not already attached
        // The listener will be removed when the last maestro visitor for this mission disconnects
        // No need to await here, the code below doesn't depend on this function
        addMaestroDocListenerForMission(missionId);

        // Update the inspector room on the default namespace
        globalValues.socketio
          .to("inspector")
          .emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on(
        "subscribeToEva",
        async (missionId: number, evaRefUuid: string, rexUuid: string | null) => {
          const subscriptions = globalValues.maestroV2.evaSubscriptions.get(missionId) ?? [];
          // Resolve the eva uuid:
          const evaUuid = await getEvaUuid(missionId, evaRefUuid, rexUuid);
          if (!evaUuid) {
            serverLogger.warning({
              logId: "socket-maestro-v2",
              logValue: `subscribeToEva - could not get evaUuid from missionId ${missionId}, evaRefUuid ${evaRefUuid} and rexUuid ${rexUuid}`,
            });
            return;
          }
          if (!subscriptions.includes(evaUuid)) {
            subscriptions.push(evaUuid);
            globalValues.maestroV2.evaSubscriptions.set(missionId, subscriptions);
          }
        }
      );

      socket.on(
        "unsubscribeToEva",
        async (missionId: number, evaRefUuid: string, rexUuid: string | null) => {
          const evaUuid = await getEvaUuid(missionId, evaRefUuid, rexUuid);
          if (!evaUuid) {
            serverLogger.warning({
              logId: "socket-maestro-v2",
              logValue: `unsubscribeToEva - could not get evaUuid from missionId ${missionId}, evaRefUuid ${evaRefUuid} and rexUuid ${rexUuid}`,
            });
            return;
          }
          removeEvaFromSubscriptions(missionId, [evaUuid]);
        }
      );

      socket.on("missionLeave", (missionId: number) => {
        const roomName = getMaestroSocketRoomName(missionId);
        socket.leave(roomName);

        const visitors = globalValues.maestroV2.visitorData[missionId];
        if (visitors) {
          // Remove this maestro visitor from the server's global under the mission room
          const removed = remove(visitors, (item) => item.socketId === socket.id);
          // If we removed the last visitor and the room is now empty, delete the key and cleanup
          if (removed.length > 0 && visitors.length === 0) {
            delete globalValues.maestroV2.visitorData[missionId];
            cleanupMaestro(missionId);
          }
        }

        // Update the inspector room on the default namespace
        globalValues.socketio
          .to("inspector")
          .emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("disconnect", () => {
        // Remove this socket from any maestro mission rooms they happened to be in
        for (const missionId in globalValues.maestroV2.visitorData) {
          const visitors = globalValues.maestroV2.visitorData[missionId];
          const removed = remove(visitors, (item) => item.socketId === socket.id);
          // If we removed the last visitor and the room is now empty, delete the key and cleanup
          if (removed.length > 0 && visitors.length === 0) {
            delete globalValues.maestroV2.visitorData[missionId];
            if (missionId != null) cleanupMaestro(+missionId);
          }
        }

        // Update the inspector room on the default namespace
        globalValues.socketio
          .to("inspector")
          .emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("getEverything", async (missionId: number, callback) => {
        if (!missionId || isNaN(missionId)) {
          callback({ status: "failure", message: "Invalid mission ID" });
          return;
        }
        try {
          const data = await RequestContext.create(globalValues.orm.em, () =>
            buildAegisSliceForMaestro(missionId)
          );
          callback({ status: "success", message: "Everything retrieved", data });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro-v2", logValue: "SocketIO - getEverything" },
            error instanceof Error ? error : new Error(String(error))
          );
          callback({ status: "error", message: `Error getting everything ${error}` });
        }
      });

      socket.on("sendMDAU", (missionId: number, mdau: MDAU.MaestroDataAegisUses) => {
        if (!missionId || isNaN(missionId)) {
          serverLogger.warning({
            logId: "socket-maestro-v2",
            logValue: `sendMDAU - invalid missionId ${missionId}`,
          });
          return;
        }
        try {
          const { aegisStations } = mdau;

          // update stations
          applyMdauStationsToDoc(missionId, aegisStations).catch((error) => {
            serverLogger.error(
              {
                logId: "socket-maestro-v2",
                logValue: "SocketIO - sendMDAU - applyMdauStationsToDoc",
              },
              error instanceof Error ? error : new Error(String(error))
            );
          });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro-v2", logValue: "SocketIO - sendMDAU" },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      // Summary of Maestro v2 information for the admin inspector
      socket.on("getDebugInfo", (callback) => {
        callback(buildDebugInfo());
      });
    }
  );
};

// Helper function to convert an evaRefUuid and rexUuid into the evaUuid
const getEvaUuid = async (missionId: number, evaRefUuid: string, rexUuid: string | null) => {
  // First try to get the mission information from the global maestro doc handle
  let mission;
  const docHandle = globalValues.maestroV2.docHandles.get(missionId);
  if (!docHandle) {
    mission = (await getAutomergeMissions([missionId]))[0];
    if (!mission) return;
  } else {
    mission = docHandle.doc();
  }
  if (!mission) return;

  if (rexUuid) {
    // Verify the rex exists and its EVA matches the given refUuid
    const rex = mission.rexes?.[rexUuid];
    if (!rex) return;
    const eva = mission.evas?.[rex.evaUuid];
    if (!eva || eva.refUuid !== evaRefUuid) return;
    return rex.evaUuid;
  } else {
    // Get the as-planned EVA (not linked to any rex)
    const asPlannedEva = getAsPlannedEvaFromRefUuid(mission, evaRefUuid);
    if (!asPlannedEva) return;
    return asPlannedEva.uuid;
  }
};

/**
 * One liner function to unify where the room name string is built for maestro namespace
 * This is for consistency and to avoid hardcoding the room name string in multiple places
 * @param missionId
 * @returns
 */
export const getMaestroSocketRoomName = (missionId: number): string => {
  return `maestro${missionId}`;
};
export const getMissionIdFromSocketRoomName = (roomName: string): number | null => {
  const match = roomName.match(/^maestro(\d+)$/);
  if (match) {
    return parseInt(match[1]);
  }
  return null;
};

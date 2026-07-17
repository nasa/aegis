/**
 * /maestro namespace — Maestro API client connections
 *
 * Auth is enforced once at connection time via namespace middleware.
 * All handlers in this file can assume the socket is EMSS-authenticated.
 */
import { serverLogger } from "utils/logging/serverLogger";
import remove from "lodash/remove";
import type { DefaultEventsMap, Server, Socket } from "socket.io";
import { RequestContext } from "@mikro-orm/postgresql";
import { globalValues } from "./global";
import {
  addMaestroDocListenerForMission,
  applyMdauStationsToDoc,
  cleanupMaestro,
  removeEvaFromSubscriptions,
} from "server/express/sockets-maestro-emitters";
import { emssTokenIsValid } from "utils/permissions";
import { asError } from "@emss/utils";
import { overwriteRex } from "server/maestro/rexOverwrite";
import { validateRexOverwrite } from "server/maestro/rexOverwriteValidator";
import { buildAegisEntityForMaestro } from "utils/maestro";
import { getAutomergeMissions } from "server/express/routes/missionAutomerge";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";

export const setupMaestroNamespace = (
  io: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>
): void => {
  // Cast to Maestro-specific types — io.of() inherits the server's generic types by default,
  // but the /maestro namespace has its own distinct event interfaces.
  const maestroNamespace = io.of("/maestro") as unknown as Namespace<
    MaestroClientToServerEvents,
    MaestroServerToClientEvents,
    DefaultEventsMap,
    {}
  >;
  globalValues.maestro.socketio = maestroNamespace;

  // ── Auth middleware ───────────────────────────────────────────────────────
  // Runs once per connection attempt. Rejects the socket before any events
  // fire if the EMSS token is missing or invalid.
  maestroNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!emssTokenIsValid(token)) {
      serverLogger.warning({
        logId: "socket-maestro",
        logValue: "Maestro namespace: rejected connection, invalid emssToken",
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
            logId: "socket-maestro",
            logValue: `missionJoin - invalid missionId ${missionId}`,
          });
          return;
        }

        const roomName = getMaestroSocketRoomName(missionId);
        socket.join(roomName);

        // Add this maestro visitor to the server's global under the mission room
        if (!globalValues.serverSocketStatus.maestroVisitors[roomName]) {
          globalValues.serverSocketStatus.maestroVisitors[roomName] = [];
        }
        const maestroVisitors = globalValues.serverSocketStatus.maestroVisitors[roomName];
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
          const subscriptions = globalValues.maestro.evaSubscriptions.get(missionId) ?? [];
          // Resolve the eva uuid:
          const evaUuid = await getEvaUuid(missionId, evaRefUuid, rexUuid);
          if (!evaUuid) {
            serverLogger.warning({
              logId: "socket-maestro",
              logValue: `subscribeToEva - could not get evaUuid from missionId ${missionId}, evaRefUuid ${evaRefUuid} and rexUuid ${rexUuid}`,
            });
          }
          if (!subscriptions.includes(evaUuid)) {
            subscriptions.push(evaUuid);
            globalValues.maestro.evaSubscriptions.set(missionId, subscriptions);
          }
        }
      );

      socket.on(
        "unsubscribeToEva",
        async (missionId: number, evaRefUuid: string, rexUuid: string | null) => {
          const evaUuid = await getEvaUuid(missionId, evaRefUuid, rexUuid);
          if (!evaUuid) {
            serverLogger.warning({
              logId: "socket-maestro",
              logValue: `unsubscribeToEva - could not get evaUuid from missionId ${missionId}, evaRefUuid ${evaRefUuid} and rexUuid ${rexUuid}`,
            });
          }
          removeEvaFromSubscriptions(missionId, evaUuid ? [evaUuid] : []);
        }
      );

      socket.on("missionLeave", (missionId: number) => {
        const roomName = getMaestroSocketRoomName(missionId);
        socket.leave(roomName);

        if (globalValues.serverSocketStatus.maestroVisitors[roomName]) {
          // Remove this maestro visitor from the server's global under the mission room
          remove(globalValues.serverSocketStatus.maestroVisitors[roomName], (item) => {
            return item.socketId === socket.id;
          });
          // If the room is now empty
          if (globalValues.serverSocketStatus.maestroVisitors[roomName].length === 0) {
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
        for (const roomName in globalValues.serverSocketStatus.maestroVisitors) {
          remove(globalValues.serverSocketStatus.maestroVisitors[roomName], (item) => {
            return item.socketId === socket.id;
          });
          // If the room is now empty
          if (globalValues.serverSocketStatus.maestroVisitors[roomName].length === 0) {
            const missionId = getMissionIdFromSocketRoomName(roomName);
            if (missionId != null) cleanupMaestro(missionId);
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
            buildAegisEntityForMaestro(missionId)
          );
          callback({ status: "success", message: "Everything retrieved", data });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - getEverything" },
            error instanceof Error ? error : new Error(String(error))
          );
          callback({ status: "error", message: `Error getting everything ${error}` });
        }
      });

      socket.on("sendMDAU", (missionId: number, mdau: Maegistro.MaestroDataAegisUses) => {
        if (!missionId || isNaN(missionId)) {
          serverLogger.warning({
            logId: "socket-maestro",
            logValue: `sendMDAU - invalid missionId ${missionId}`,
          });
          return;
        }
        try {
          const { aegisStations, aegisRexes } = mdau;

          // Call overwriteRex for each rex entry in aegisRexes
          if (aegisRexes) {
            for (const rexEntry of Object.values(aegisRexes)) {
              const rexOverwrite: RexOverwrite = {
                uuid: rexEntry.uuid,
                petStartStopTimestamp: rexEntry.petStartStopTimestamp,
                petValueAtStartStop: rexEntry.petValueAtStartStop,
                petRunning: rexEntry.petRunning,
                isRunning: rexEntry.isRunning,
                maestroControlled: rexEntry.maestroControlled,
                maestroEventId: null, //todo these values need to be moved to EVA, not rex
                maestroEventUrl: null,
                maestroActivityPropertiesByRefUuid: rexEntry.maestroActivityPropertiesByRefUuid,
                xgressEntries: rexEntry.xgressEntries,
                stationEntriesByRefUuid: rexEntry.stationEntriesByRefUuid,
                traverseEntriesByRefUuid: rexEntry.traverseEntriesByRefUuid,
                actionEntriesByRefUuid: rexEntry.actionEntriesByRefUuid,
              };
              overwriteRex(rexOverwrite);
            }
          }

          // update stations
          applyMdauStationsToDoc(missionId, aegisStations).catch((error) => {
            serverLogger.error(
              { logId: "socket-maestro", logValue: "SocketIO - sendMDAU - applyMdauStationsToDoc" },
              error instanceof Error ? error : new Error(String(error))
            );
          });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - sendMDAU" },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      // Mimics the emss/rexOverwrite route
      socket.on("rexOverwrite", async (body: RexOverwrite, callback) => {
        // Validate inputs
        const validateMsgs = validateRexOverwrite(body);
        if (validateMsgs) {
          callback({ status: "failure", message: validateMsgs });
          return;
        }

        try {
          const updatedRexes: Rex[] = await overwriteRex(body);

          if (!updatedRexes || updatedRexes.length === 0) {
            callback({
              status: "error",
              message: "Failed to update Rex(es) after multiple tries due to optimistic locking",
            });
            return;
          }

          callback({
            status: "success",
            message: `Rex updated for rex uuids ${updatedRexes.map((r) => r.uuid).toString()}`,
            data: updatedRexes,
          });
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - rexOverwrite" },
            asError(e)
          );
          callback({ status: "error", message: `Error processing the request: ${errorMessage}` });
        }
      });
    }
  );
};

// Helper function to convert an evaRefUuid and rexUuid into the evaUuid
const getEvaUuid = async (missionId: number, evaRefUuid: string, rexUuid: string | null) => {
  // First try to get the mission information from the global maestro doc handle
  let mission;
  const docHandle = globalValues.maestro.docHandles.get(missionId);
  if (!docHandle) {
    mission = (await getAutomergeMissions([missionId]))[0];
    if (!mission) return;
  } else {
    mission = docHandle.doc();
  }

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

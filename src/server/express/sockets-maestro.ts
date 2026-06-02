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
  buildAegisEntityForMaestro,
  cleanupSocketRoom,
} from "server/express/sockets-maestro-emitters";
import { emssTokenIsValid } from "utils/permissions";
import { emitStoreUpsert } from "./sockets";
import { asError } from "@emss/utils";
import { getBackupDbMissions } from "server/express/routes/mission";
import { getReadableEvaData } from "server/express/routes/readable/eva";
import { getMissionsData } from "server/express/routes/emss/getMissions";
import { getRexesByEvaRefData } from "server/express/routes/emss/getRexesByEvaRef";
import { overwriteRex } from "server/express/routes/emss/rexOverwrite";
import { validateRexOverwrite } from "utils/rexOverwriteValidator";
import { upsertDatabaseRetry } from "utils/database";
import { Eva_db, Rex_db } from "server/database/models/_allModels";

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
        if (!globalValues.serverSocketStatus.maestroMissionVisitors[roomName]) {
          globalValues.serverSocketStatus.maestroMissionVisitors[roomName] = [];
        }
        const maestroMissionVisitors =
          globalValues.serverSocketStatus.maestroMissionVisitors[roomName];
        // Set this visitor's information on the server's global
        // Remove this socket from tracking list if it exists and push the new one
        remove(maestroMissionVisitors, (item) => {
          return item.socketId === socket.id;
        });
        maestroVisitor.socketId = socket.id;
        maestroMissionVisitors.push(maestroVisitor);

        // Attach automerge listener for this mission if not already attached
        // The listener will be removed when the last maestro visitor for this mission disconnects
        // No need to await here, the code below doesn't depend on this function
        addMaestroDocListenerForMission(missionId, roomName);

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
          if (!evaUuid) return;
          if (!subscriptions.includes(evaUuid)) {
            subscriptions.push(evaUuid);
            globalValues.maestro.evaSubscriptions.set(missionId, subscriptions);
          }
        }
      );

      socket.on(
        "unsubscribeToEva",
        async (missionId: number, evaRefUuid: string, rexUuid: string | null) => {
          const subscriptions = globalValues.maestro.evaSubscriptions.get(missionId);
          if (subscriptions) {
            // Convert eva refUuid to uuid
            const evaUuid = await getEvaUuid(missionId, evaRefUuid, rexUuid);
            if (!evaUuid) return;
            remove(subscriptions, (uuid) => uuid === evaUuid);
            if (subscriptions.length === 0) {
              globalValues.maestro.evaSubscriptions.delete(missionId);
            }
          }
        }
      );

      socket.on("missionLeave", (missionId: number) => {
        const roomName = getMaestroSocketRoomName(missionId);
        socket.leave(roomName);

        if (globalValues.serverSocketStatus.maestroMissionVisitors[roomName]) {
          // Remove this maestro visitor from the server's global under the mission room
          remove(globalValues.serverSocketStatus.maestroMissionVisitors[roomName], (item) => {
            return item.socketId === socket.id;
          });
          // If the room is now empty
          if (globalValues.serverSocketStatus.maestroMissionVisitors[roomName].length === 0) {
            cleanupSocketRoom(roomName);
          }
        }

        // Update the inspector room on the default namespace
        globalValues.socketio
          .to("inspector")
          .emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("disconnect", () => {
        // Remove this socket from any maestro mission rooms they happened to be in
        for (const roomName in globalValues.serverSocketStatus.maestroMissionVisitors) {
          remove(globalValues.serverSocketStatus.maestroMissionVisitors[roomName], (item) => {
            return item.socketId === socket.id;
          });
          // If the room is now empty
          if (globalValues.serverSocketStatus.maestroMissionVisitors[roomName].length === 0) {
            cleanupSocketRoom(roomName);
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

      // Mimics the api/v1/mission route
      socket.on("getMission", async (missionId: number, callback) => {
        try {
          const data = await RequestContext.create(globalValues.orm.em, () =>
            getBackupDbMissions([missionId])
          );
          callback({ status: "success", message: "Mission retrieved", data });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - getMission" },
            error instanceof Error ? error : new Error(String(error))
          );
          callback({ status: "error", message: `Error getting mission ${error}` });
        }
      });

      // Mimics the api/v1/readable/eva route
      socket.on("getReadableEva", async (params: ReadableEvaParams, callback) => {
        if (!params.missionId || isNaN(params.missionId)) {
          callback({ status: "failure", message: "Invalid mission ID" });
          return;
        }
        try {
          const data = await RequestContext.create(globalValues.orm.em, () =>
            getReadableEvaData(params)
          );
          callback({ status: "success", message: "Readable EVAs retrieved", data });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - getReadableEva" },
            error instanceof Error ? error : new Error(String(error))
          );
          callback({ status: "error", message: `Error getting readable EVAs ${error}` });
        }
      });

      // Mimics the emss/getMissions route
      socket.on("getMissions", async (callback) => {
        try {
          const data = await RequestContext.create(globalValues.orm.em, () => getMissionsData());
          callback({ status: "success", message: "Missions and their EVAs retrieved", data });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - getMissions" },
            error instanceof Error ? error : new Error(String(error))
          );
          callback({ status: "error", message: `Error getting missions and their evas ${error}` });
        }
      });

      // Mimics the emss/getRexesByEvaRef route
      socket.on("getRexesByEvaRef", async (evaRefUuid: string, callback) => {
        if (!evaRefUuid) {
          callback({ status: "failure", message: "No EVA Ref given" });
          return;
        }
        try {
          const data = await getRexesByEvaRefData(evaRefUuid);
          callback({ status: "success", message: "Rexes retrieved", data });
        } catch (error) {
          serverLogger.error(
            { logId: "socket-maestro", logValue: "SocketIO - getRexesByEvaRef" },
            error instanceof Error ? error : new Error(String(error))
          );
          callback({ status: "error", message: `Error getting rexes ${error}` });
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
          const updatedRexes: Rex[] = await upsertDatabaseRetry(() => overwriteRex(body));

          if (!updatedRexes || updatedRexes.length === 0) {
            callback({
              status: "error",
              message: "Failed to update Rex(es) after multiple tries due to optimistic locking",
            });
            return;
          }

          // emit back to aegis users via normal sockets\
          emitStoreUpsert({
            missionId: updatedRexes[0].missionId,
            socketId: "maestroApi",
            type: "rex",
            data: updatedRexes,
          } as StoreUpsert);

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
  const em = globalValues.orm.em.fork();
  let evaUuid: string;
  if (rexUuid) {
    const rex = await em.findOne(
      Rex_db,
      { missionId: missionId, uuid: rexUuid },
      { fields: ["uuid", "evaUuid"] }
    );
    if (!rex) return;
    const eva = await em.findOne(
      Eva_db,
      { missionId: missionId, uuid: rex.evaUuid, refUuid: evaRefUuid },
      { fields: ["uuid"] }
    );
    if (!eva) return;
    evaUuid = rex.evaUuid;
  } else {
    // Get the as-planned EVA
    const evasWithRef = await em.find(
      Eva_db,
      { missionId: missionId, refUuid: evaRefUuid },
      { fields: ["uuid"] }
    );
    if (evasWithRef.length === 0) return;
    const evaUuids = evasWithRef.map((e) => e.uuid);
    // Find those eva uuids have an associated rex
    const evaUuidsWithRexes = (
      await em.find(
        Rex_db,
        { missionId: missionId, evaUuid: { $in: evaUuids } },
        { fields: ["evaUuid"] }
      )
    ).map((r) => r.evaUuid);
    const asPlannedEva = evasWithRef.find((e) => !evaUuidsWithRexes.includes(e.uuid));
    if (!asPlannedEva) return;
    evaUuid = asPlannedEva.uuid;
  }
  return evaUuid;
};

/**
 * One liner function to unify where the room name string is built.
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

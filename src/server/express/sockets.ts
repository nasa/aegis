import { serverLogger } from "utils/logging/serverLogger";
import uniq from "lodash/uniq";
import remove from "lodash/remove";
import find from "lodash/find";
import isEqual from "lodash/isEqual";
import { globalValues } from "./global";
import type { DefaultEventsMap, Socket } from "socket.io";

export const setupSocketIO = (): void => {
  const visitorsData: VisitorData[] = globalValues.serverSocketStatus.visitorsData;
  const io = globalValues.socketio;

  // Listen for connection events
  io.on(
    "connection",
    (socket: Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>) => {
      // emit AEGIS app version to client that just connected
      socket.emit("version", globalValues.appVersion);

      socket.on("visitorJoin", (visitorData: VisitorData) => {
        try {
          // check app version and git commit
          if (!isEqual(visitorData.clientAppVersion, globalValues.appVersion)) {
            serverLogger.warning({
              logId: "socket",
              logValue: `SocketIO - visitorJoin: appVersion mismatch between client and server
          client: ${JSON.stringify(visitorData.clientAppVersion)}
          server: ${JSON.stringify(globalValues.appVersion)}`,
              launchpadUser: visitorData.launchpadUser?.auid,
              appUser: visitorData.appUser?.username,
              missionId: visitorData.missionId,
            });
          }

          // join the room for this mission
          socket.join(visitorData.missionId.toString());

          // set this visitor's information on the server's global
          // remove this socket from tracking list if it exists and push the new one
          // Use the server's authoritative socket.id for this client rather than the client-provided
          // visitorData.socketId that comes in with the join message
          remove(visitorsData, (item) => {
            return item.socketId === socket.id;
          });
          visitorData.socketId = socket.id;
          visitorsData.push(visitorData);

          // emit new status to all clients in this room including this client
          const statusFromServer = getStatusFromServer(visitorData.missionId);
          io.to(visitorData.missionId.toString()).emit("statusFromServer", statusFromServer);

          // update the inspector room
          io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
        } catch (error) {
          serverLogger.error(
            {
              logId: "socket",
              logValue: "SocketIO - visitorJoin",
              launchpadUser: visitorData.launchpadUser?.auid,
              appUser: visitorData.appUser?.username,
              missionId: visitorData.missionId,
            },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      socket.on("inspectorJoin", () => {
        socket.join("inspector"); // join an inspector room

        // using io.to will emit to all clients in the inspector room, including this client
        io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("getMaestroDebugInfo", (callback) => {
        const docListenerMissionIds = Array.from(globalValues.maestro.docListeners.keys());
        const evaSubscriptions: { [missionId: number]: string[] } = {};
        globalValues.maestro.evaSubscriptions.forEach((uuids, missionId) => {
          evaSubscriptions[missionId] = uuids;
        });
        callback({ docListenerMissionIds, evaSubscriptions });
      });

      socket.on("disconnect", () => {
        try {
          // remove this socket if it's a regular visitor
          const visitorBeingRemoved = find(visitorsData, {
            socketId: socket.id,
          });
          if (visitorBeingRemoved) {
            remove(visitorsData, (item) => {
              return item.socketId === visitorBeingRemoved.socketId;
            });

            // emit updated visitor count to all clients in this room
            const statusFromServer = getStatusFromServer(visitorBeingRemoved.missionId);
            socket
              .to(visitorBeingRemoved.missionId.toString())
              .emit("statusFromServer", statusFromServer);
          }

          // update the inspector room
          io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
        } catch (error) {
          serverLogger.error(
            { logId: "socket", logValue: "SocketIO - disconnect" },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      // send server status to all clients in every room every 10 seconds
      if (!globalValues.socketInterval) {
        globalValues.socketInterval = setInterval(() => {
          // get unique missionIds to find all the rooms
          const missionIds = uniq(visitorsData.map((item) => item.missionId));
          for (const missionId of missionIds) {
            const statusFromServer = getStatusFromServer(missionId);
            io.to(missionId.toString()).emit("statusFromServer", statusFromServer);
          }
        }, 10000);
      }
    }
  );
};

// build the heartbeat message sent every 10 seconds to clients
const getStatusFromServer = (missionId: number): StatusFromServer => {
  let editorCounts = 0;
  let viewerCounts = 0;
  const visitorsData = globalValues.serverSocketStatus.visitorsData;
  for (const visitorData of visitorsData) {
    if (visitorData.permission.includes("editor") && visitorData.missionId === missionId) {
      editorCounts++;
    }
    if (visitorData.permission.includes("viewer") && visitorData.missionId === missionId) {
      viewerCounts++;
    }
  }
  const serverStatus: StatusFromServer = {
    visitorCounts: {
      editors: editorCounts,
      viewers: viewerCounts,
    },
    timestamp: Date.now(),
    serverVersion: globalValues.appVersion,
  };
  return serverStatus;
};

/**
 * Server emits an upsert message to all aegis clients in the mission room
 * Called from our api endpoints
 * @param payload
 */
export const emitStoreUpsert = (payload: StoreUpsert): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload);
    io.to(payload.missionId.toString()).emit("storeUpsert", payload);

    // Update the inspector room for lastEditEvent
    io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
  } else {
    serverLogger.error(
      {
        logId: "socket",
        logValue: "emitStoreUpsert -Unable to emit upsert",
        emitType: payload.type,
        emitTypeUuid: payload.data?.map((sd: StoreData) => sd.uuid),
        missionId: payload.missionId,
      },
      new Error("Socket.io not initialized")
    );
  }
};

/**
 * Server emits a delete message to all aegis clients in the mission room
 * Called from our api endpoints
 * @param payload
 */
export const emitStoreDelete = (payload: StoreDelete): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload);
    io.to(payload.missionId.toString()).emit("storeDelete", payload);

    // update the inspector room
    io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
  } else {
    serverLogger.error(
      {
        logId: "socket",
        logValue: "emitStoreDelete - Unable to emit delete",
        emitType: payload.type,
        emitTypeUuid: payload.uuids,
        missionId: payload.missionId,
      },
      new Error("Socket.io not initialized")
    );
  }
};

/**
 * Updates the global last edit event for this mission and adds it to the payload.
 * Use function overloading to handle both StoreUpsert and StoreDelete types
 * @param payload
 * @returns
 */
function addLastEditEvent(payload: StoreUpsert): StoreUpsert;
function addLastEditEvent(payload: StoreDelete): StoreDelete;
function addLastEditEvent(payload: StoreUpsert | StoreDelete) {
  // store the last edit event for this mission
  globalValues.serverSocketStatus.lastEditEvents[payload.missionId] = {
    socketId: payload.socketId,
    type: payload.type,
    datestamp: new Date().toISOString(),
  };

  // add the last edit event to the payload
  payload.lastEditEvent = globalValues.serverSocketStatus.lastEditEvents[payload.missionId];
  return payload;
}

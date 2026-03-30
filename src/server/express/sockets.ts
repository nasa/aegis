import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import uniq from "lodash/uniq";
import remove from "lodash/remove";
import find from "lodash/find";
import isEqual from "lodash/isEqual";
import { globalValues } from "./global";
import type { DefaultEventsMap, Socket } from "socket.io";
import { emitMaestroStoreDelete, emitMaestroStoreUpsert } from "server/express/maestro-sockets";

export const setupSocketIO = (): void => {
  // initialize the global object that will store the visitor tracking data and last edit events
  const visitorsData: VisitorData[] = globalValues.serverSocketStatus.visitorsData;
  const maestroVisitors: MaestroVisitor[] = globalValues.serverSocketStatus.maestroVisitors;
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
            });
          }

          // join the room for this mission
          socket.join(visitorData.missionId.toString());

          // set this visitor's information on the server's global
          // remove this socket from tracking list if it exists and push the new one
          remove(visitorsData, (item) => {
            return item.socketId === visitorData.socketId;
          });
          visitorsData.push(visitorData);

          // emit new status to all clients in this room including this client
          const statusFromServer = getStatusFromServer(visitorData.missionId);
          io.to(visitorData.missionId.toString()).emit("statusFromServer", statusFromServer);

          // update the inspector room
          io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
        } catch (error) {
          serverLogger.error(
            { logId: "socket", logValue: "SocketIO - visitorJoin" },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      socket.on("maestroJoin", (maestroVisitor: MaestroVisitor) => {
        socket.join(`maestro`); // join a maestro room

        // set this visitor's information on the server's global
        // remove this socket from tracking list if it exists and push the new one
        remove(maestroVisitors, (item) => {
          return item.socketId === maestroVisitor.socketId;
        });
        maestroVisitors.push(maestroVisitor);

        // update the inspector room
        io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("inspectorJoin", () => {
        socket.join("inspector"); // join an inspector room

        // using io.to will emit to all clients in the inspector room, including this client
        io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("disconnect", () => {
        try {
          // remove if this is a maestro visitor
          remove(maestroVisitors, (item) => {
            return item.socketId === socket.id;
          });

          // remove this socket from the visitor tracking
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

export const getStatusFromServer = (missionId: number): StatusFromServer => {
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
 * Server emits an upsert message to all clients in the mission room, and maestro room
 * @param payload
 */
export const emitStoreUpsert = (payload: StoreUpsert): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload);
    io.to(payload.missionId.toString()).emit("storeUpsert", payload);

    // update the inspector room
    io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);

    // check if we need to emit to maestro room
    if (globalValues.serverSocketStatus.maestroVisitors?.length === 0) return; // no maestro connected
    if (["eva", "station", "traverse", "action", "mission", "rex"].includes(payload.type)) {
      emitMaestroStoreUpsert(payload);
    }
  } else {
    serverLogger.error(
      { logId: "socket", logValue: "Unable to emit upsert" },
      new Error("Socket.io not initialized")
    );
  }
};

/**
 * Server emits a delete message to all clients in the mission room, and maestro room
 * @param payload
 */
export const emitStoreDelete = (payload: StoreDelete): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload);
    io.to(payload.missionId.toString()).emit("storeDelete", payload);

    // update the inspector room
    io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);

    // check if we need to emit to maestro room
    if (globalValues.serverSocketStatus.maestroVisitors?.length === 0) return; // no maestro connected
    if (["eva", "station", "traverse", "action", "mission", "rex"].includes(payload.type)) {
      emitMaestroStoreDelete(payload);
    }
  } else {
    serverLogger.error(
      { logId: "socket", logValue: "Unable to emit delete" },
      new Error("Socket.io not initialized")
    );
  }
};

/**
 * Updates the global last edit event for this mission and adds it to the payload
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

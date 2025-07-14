import uniq from "lodash/uniq";
import remove from "lodash/remove";
import find from "lodash/find";
import isEqual from "lodash/isEqual";
import { globalValues } from "./global";
import type { DefaultEventsMap, Socket } from "socket.io";

export const setupSocketIO = (): void => {
  // initialize the global object that will store the visitor tracking data and last edit events
  const visitorsData: VisitorData[] = globalValues.serverSocketStatus.visitorsData;
  let socketInterval: NodeJS.Timeout = null;
  const io = globalValues.socketio;

  // Listen for connection events
  io.on(
    "connection",
    (socket: Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>) => {
      // emit AEGIS app version to client that just connected
      socket.emit("version", globalValues.appVersion);

      socket.on("visitorJoin", (visitorData: VisitorData) => {
        try {
          // check app version and git commit
          if (!isEqual(visitorData.appVersion, globalValues.appVersion)) {
            console.log(
              `SocketIO - visitorJoin: appVersion mismatch between client and server
          client: ${JSON.stringify(visitorData.appVersion)}
          server: ${JSON.stringify(globalValues.appVersion)}`
            );
            return;
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
        } catch (error) {
          console.error("SocketIO - visitorJoin: ", error);
        }
      });

      socket.on("disconnect", () => {
        try {
          const visitorBeingRemoved = find(visitorsData, {
            socketId: socket.id,
          });
          if (!visitorBeingRemoved) return;
          // remove this socket from the visitor tracking
          remove(visitorsData, (item) => {
            return item.socketId === visitorBeingRemoved.socketId;
          });
          const statusFromServer = getStatusFromServer(visitorBeingRemoved.missionId);
          // emit updated visitor count to all clients in this room
          socket
            .to(visitorBeingRemoved.missionId.toString())
            .emit("statusFromServer", statusFromServer);
        } catch (error) {
          console.error("SocketIO - disconnect: ", error);
        }
      });

      // send server status to all clients in every room every 10 seconds
      if (!socketInterval) {
        socketInterval = setInterval(() => {
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
 * Server emits an upsert message to all clients in the mission room
 * @param payload
 */
export const emitStoreUpsert = (payload: StoreUpsert): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload) as StoreUpsert;
    io.to(payload.missionId.toString()).emit("storeUpsert", payload);
  } else {
    console.error("Socket.io not initialized. Unable to emit upsert.");
  }
};

/**
 * Server emits a delete message to all clients in the mission room
 * @param payload
 */
export const emitStoreDelete = (payload: StoreDelete): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload) as StoreDelete;
    io.to(payload.missionId.toString()).emit("storeDelete", payload);
  } else {
    console.error("Socket.io not initialized. Unable to emit delete.");
  }
};

/**
 * updates the global last edit event for this mission
 * @param payload
 * @returns
 */
const addLastEditEvent = (payload: StoreUpsert | StoreDelete) => {
  // store the last edit event for this mission
  globalValues.serverSocketStatus.lastEditEvents[payload.missionId] = {
    socketId: payload.socketId,
    type: payload.type,
    datestamp: new Date().toISOString(),
  };

  // add the last edit event to the payload
  payload.lastEditEvent = globalValues.serverSocketStatus.lastEditEvents[payload.missionId];
  return payload;
};

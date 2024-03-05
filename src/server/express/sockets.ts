import packagejson from "../../../package.json";

import _ from "lodash";
import { globalValues } from "./global";

export const setupSocketIO = (): void => {
  // initialize the global object that will store the visitor tracking data and last edit events

  const visitorsData: VisitorData[] = globalValues.serverSocketStatus.visitorsData;

  let socketInterval: NodeJS.Timeout = null;

  const io = globalValues.socketio;

  // Listen for connection events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.on("connection", (socket: any) => {
    // (async () => {
    //   const sockets = await io.fetchSockets();
    //   console.log(
    //     `${new Date().toISOString()} Socket ${socket.id} connected. Count across missions: ${
    //       sockets.length
    //     }`
    //   );
    // })();

    // emit AEGIS app version to client that just connected
    socket.emit("version", packagejson.version || "unknown version");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on("visitorJoin", (visitorJoin: any) => {
      // join the room for this mission
      socket.join(visitorJoin.missionId.toString());

      const visitorData: VisitorData = {
        socketId: socket.id,
        missionId: visitorJoin.missionId,
        type: visitorJoin.type,
      };

      // remove this socket from tracking list if it exists
      _.remove(visitorsData, (item) => {
        return item.socketId === visitorData.socketId;
      });
      visitorsData.push(visitorData);

      const statusFromServer = getStatusFromServer(visitorJoin.missionId);

      // emit visitor count to all clients in this room including this client
      io.to(visitorJoin.missionId.toString()).emit("statusFromServer", statusFromServer);

      // console.log(
      //   `${new Date().toISOString()} Socket ${socket.id} visitorJoin. Editors: ${
      //     statusFromServer.visitorCounts.editors
      //   } Viewers: ${statusFromServer.visitorCounts.viewers}.`
      // );
    });

    socket.on("disconnect", () => {
      const visitorBeingRemoved = _.find(visitorsData, {
        socketId: socket.id,
      });

      // remove this socket from the visitor tracking
      _.remove(visitorsData, (item) => {
        return item.socketId === visitorBeingRemoved.socketId;
      });
      const statusFromServer = getStatusFromServer(visitorBeingRemoved.missionId);
      // emit visitor count to all clients in this room
      socket
        .to(visitorBeingRemoved.missionId.toString())
        .emit("statusFromServer", statusFromServer);

      // console.log(`${new Date().toISOString()} Socket ${socket.id} disconnected.`);
    });

    // sent visitor counts to all clients in every room every 10 seconds
    if (!socketInterval) {
      socketInterval = setInterval(() => {
        // get unique missionIds from visitorTracking. These are used as room names
        const missionIds = _.uniq(visitorsData.map((item) => item.missionId));
        for (const missionId of missionIds) {
          const statusFromServer = getStatusFromServer(missionId);
          io.to(missionId.toString()).emit("statusFromServer", statusFromServer);
        }
      }, 10000);
    }
  });
};

export const getStatusFromServer = (missionId: number): StatusFromServer => {
  let editorCounts = 0;
  let viewerCounts = 0;
  const visitorsData = globalValues.serverSocketStatus.visitorsData;
  for (const visitorData of visitorsData) {
    if (visitorData.type.includes("editor") && visitorData.missionId === missionId) {
      editorCounts++;
    }
    if (visitorData.type.includes("viewer") && visitorData.missionId === missionId) {
      viewerCounts++;
    }
  }
  const visitorCounts: VisitorCounts = {
    editors: editorCounts,
    viewers: viewerCounts,
  };
  return {
    visitorCounts,
    timestamp: Date.now(),
  };
};

export const emitStoreUpsert = (
  payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission | Rex>
): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload) as StoreUpsert<
      POI | Preset | Station | Eva | Action | Traverse | Mission | Rex
    >;
    io.to(payload.missionId.toString()).emit("storeUpsert", payload);
  } else {
    console.log("Unable to emit upsert. Socket.io not initialized");
  }
};

export const emitStoreDelete = (payload: StoreDelete): void => {
  const io = globalValues.socketio;
  if (io) {
    payload = addLastEditEvent(payload) as StoreDelete;
    io.to(payload.missionId.toString()).emit("storeDelete", payload);
  } else {
    console.log("Unable to emit delete. Socket.io not initialized");
  }
};

const addLastEditEvent = (
  payload:
    | StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission | Rex>
    | StoreDelete
) => {
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

import { Server } from "socket.io";
import _ from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { Server as NetServer } from "http";
import { Socket } from "net";
import type { Server as SocketIOServer } from "socket.io";
import packagejson from "../../package.json";

type NextApiResponseServerIO = NextApiResponse & {
  socket: Socket & {
    server: NetServer & {
      io: SocketIOServer;
    };
  };
};

const SocketHandler = (req: NextApiRequest, res: NextApiResponseServerIO): void => {
  if (!global.__socketio__) {
    console.log("*First use, starting Socket.IO");

    // initialize the global object that will store the visitor tracking data and last edit events
    global.__serverSocketStatus__ = {
      visitorsData: [],
      lastEditEvents: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const httpServer: NetServer = res.socket.server as any;
    const io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(httpServer, {
      transports: ["websocket"],
      path: "/api/socketio",
    });

    const visitorsData: VisitorData[] = global.__serverSocketStatus__.visitorsData;

    // Listen for connection events
    io.on("connection", (socket) => {
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

      socket.on("visitorJoin", (visitorJoin) => {
        // join the room for this mission
        socket.join(visitorJoin.missionId.toString());

        const visitorData: VisitorData = {
          socketId: socket.id,
          uniqueClientId: visitorJoin.uniqueClientId,
          missionId: visitorJoin.missionId,
          type: visitorJoin.type,
        };

        // remove this socket from tracking list if it exists
        _.remove(visitorsData, (item) => {
          return item.uniqueClientId === visitorData.uniqueClientId;
        });
        visitorsData.push(visitorData);

        const statusFromServer = getStatusFromServer(visitorJoin.missionId);
        // emit visitor count to all clients in this room
        socket.to(visitorJoin?.missionId.toString()).emit("statusFromServer", statusFromServer);

        // console.log(
        //   `${new Date().toISOString()} Socket ${
        //     socket.id
        //   } visitorJoin. ClientId: ${visitorJoin.uniqueClientId.slice(-4)} Editors: ${
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
          return item.uniqueClientId === visitorBeingRemoved.uniqueClientId;
        });
        const statusFromServer = getStatusFromServer(visitorBeingRemoved.missionId);
        // emit visitor count to all clients in this room
        socket
          .to(visitorBeingRemoved.missionId.toString())
          .emit("statusFromServer", statusFromServer);

        // console.log(
        //   `${new Date().toISOString()} Socket ${
        //     socket.id
        //   } ClientId: ${visitorBeingRemoved.uniqueClientId.slice(-4)} disconnected.`
        // );
      });

      // sent visitor counts to all clients in every room every 10 seconds
      if (!global.__socketInterval__) {
        global.__socketInterval__ = setInterval(() => {
          // get unique missionIds from visitorTracking. These are used as room names
          const missionIds = _.uniq(visitorsData.map((item) => item.missionId));
          for (const missionId of missionIds) {
            const statusFromServer = getStatusFromServer(missionId);
            io.to(missionId.toString()).emit("statusFromServer", statusFromServer);
          }
        }, 10000);
      }
    });

    // store the io instance as a global variable so it can be accessed by other server endpoints
    global.__socketio__ = io;
  }
  res.end();
};

export default SocketHandler;

const getStatusFromServer = (missionId: number): StatusFromServer => {
  let editorCounts = 0;
  let viewerCounts = 0;
  const visitorsData = global.__serverSocketStatus__.visitorsData;
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
  };
};

export const emitStoreUpsert = (
  payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>
): void => {
  const io = global.__socketio__;
  payload = addLastEditEvent(payload) as StoreUpsert<
    POI | Preset | Station | Eva | Action | Traverse
  >;

  if (io) {
    io.emit("storeUpsert", payload);
  } else {
    console.log("Unable to emit upsert. Socket.io not initialized");
  }
};

export const emitStoreDelete = (payload: StoreDelete): void => {
  const io = global.__socketio__;
  payload = addLastEditEvent(payload) as StoreDelete;
  if (io) {
    io.emit("storeDelete", payload);
  } else {
    console.log("Unable to emit delete. Socket.io not initialized");
  }
};

const addLastEditEvent = (
  payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse> | StoreDelete
) => {
  // store the last edit event for this mission
  global.__serverSocketStatus__.lastEditEvents[payload.missionId] = {
    uniqueClientId: payload.uniqueClientId,
    type: payload.type,
    datestamp: new Date().toISOString(),
  };

  // add the last edit event to the payload
  payload.lastEditEvent = global.__serverSocketStatus__.lastEditEvents[payload.missionId];
  return payload;
};

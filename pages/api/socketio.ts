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
  if (!res.socket.server.io) {
    console.log("*First use, starting Socket.IO");
    global.__visitorTracking__ = [];

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

    const visitorTracking: VisitorData[] = global.__visitorTracking__;

    // Listen for connection events
    io.on("connection", (socket) => {
      (async () => {
        const sockets = await io.fetchSockets();
        console.log(
          `${new Date().toISOString()} Socket ${socket.id} connected. Count across missions: ${
            sockets.length
          }`
        );
      })();
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
        _.remove(visitorTracking, (item) => {
          return item.uniqueClientId === visitorData.uniqueClientId;
        });
        visitorTracking.push(visitorData);

        const visitorCounts = getVisitorCounts(visitorJoin.missionId);
        // emit visitor count to all clients in this room
        socket.to(visitorJoin?.missionId.toString()).emit("visitorCounts", visitorCounts);

        console.log(
          `${new Date().toISOString()} Socket ${
            socket.id
          } visitorJoin. ClientId: ${visitorJoin.uniqueClientId.slice(-4)} Editors: ${
            visitorCounts.editors
          } Viewers: ${visitorCounts.viewers}.`
        );
      });

      socket.on("disconnect", () => {
        const visitorBeingRemoved = _.find(visitorTracking, {
          socketId: socket.id,
        });

        // remove this socket from the visitor tracking
        _.remove(visitorTracking, (item) => {
          return item.uniqueClientId === visitorBeingRemoved.uniqueClientId;
        });
        const visitorCounts = getVisitorCounts(visitorBeingRemoved.missionId);
        // emit visitor count to all clients in this room
        socket.to(visitorBeingRemoved.missionId.toString()).emit("visitorCounts", visitorCounts);

        console.log(
          `${new Date().toISOString()} Socket ${
            socket.id
          } ClientId: ${visitorBeingRemoved.uniqueClientId.slice(-4)} disconnected.`
        );
      });

      // sent visitor counts to all clients in every room every 10 seconds
      setInterval(() => {
        // get unique missionIds from visitorTracking. These are used as room names
        const missionIds = _.uniq(visitorTracking.map((item) => item.missionId));
        for (const missionId of missionIds) {
          const visitorCounts = getVisitorCounts(missionId);
          io.to(missionId.toString()).emit("visitorCounts", visitorCounts);
        }
      }, 10000);
    });

    res.socket.server.io = io;

    // store the io instance as a global variable so it can be accessed by other server endpoints
    global.__socketio__ = io;
  }
  res.end();
};

export default SocketHandler;

const getVisitorCounts = (missionId: number): VisitorCounts => {
  let editorCounts = 0;
  let viewerCounts = 0;
  const visitorTracking = global.__visitorTracking__;
  for (const trackingItem of visitorTracking) {
    if (trackingItem.type.includes("editor") && trackingItem.missionId === missionId) {
      editorCounts++;
    }
    if (trackingItem.type.includes("viewer") && trackingItem.missionId === missionId) {
      viewerCounts++;
    }
  }
  return {
    editors: editorCounts,
    viewers: viewerCounts,
  };
};

export const emitStoreUpsert = (
  payload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>
): void => {
  const io = global.__socketio__;
  if (io) {
    io.emit("storeUpsert", payload);
  } else {
    console.log("Unable to emit upsert. Socket.io not initialized");
  }
};

export const emitStoreDelete = (payload: StoreDelete): void => {
  const io = global.__socketio__;
  if (io) {
    io.emit("storeDelete", payload);
  } else {
    console.log("Unable to emit delete. Socket.io not initialized");
  }
};

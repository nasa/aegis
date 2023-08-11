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

global.__visitorTracking__ = [];

const SocketHandler = (req: NextApiRequest, res: NextApiResponseServerIO): void => {
  if (!res.socket.server.io) {
    console.log("*First use, starting Socket.IO");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const httpServer: NetServer = res.socket.server as any;
    const io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(httpServer, {
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

        const visitorCounts = getVisitorCounts(visitorTracking, visitorJoin.missionId);

        // emit visitor count to all clients in this room
        setTimeout(() => {
          socket.to(visitorJoin?.missionId.toString()).emit("visitorCounts", visitorCounts);
        }, 1000);

        console.log(
          `${new Date().toISOString()} Socket ${socket.id} visitorJoin. Editors: ${
            visitorCounts.editors
          } Viewers: ${visitorCounts.viewers}.`,
          visitorTracking
        );
      });

      socket.on("disconnect", () => {
        const visitorDataItemBeingRemoved = _.find(visitorTracking, {
          socketId: socket.id,
        });

        // remove this socket from the visitor tracking
        _.remove(visitorTracking, (item) => {
          return item.uniqueClientId === visitorDataItemBeingRemoved.uniqueClientId;
        });

        const visitorCounts = getVisitorCounts(
          visitorTracking,
          visitorDataItemBeingRemoved.missionId
        );

        // emit visitor counts for this room to all clients in this room
        setTimeout(() => {
          socket
            .to(visitorDataItemBeingRemoved?.missionId.toString())
            .emit("visitorCounts", visitorCounts);
        }, 1000);

        console.log(
          `${new Date().toISOString()} Socket ${socket.id} disconnected. Editors: ${
            visitorTracking.map((item) => item.type.includes("editor")).length
          } Viewers: ${visitorTracking.map((item) => item.type.includes("viewer")).length}.`,
          visitorTracking
        );
      });
    });

    res.socket.server.io = io;

    // store the io instance as a global variable so it can be accessed by other server endpoints
    global.__socketio__ = io;
  }
  res.end();
};

export default SocketHandler;

const getVisitorCounts = (visitorTracking: VisitorData[], missionId: number): VisitorCounts => {
  let editorCounts = 0;
  let viewerCounts = 0;
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

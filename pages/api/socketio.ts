import { Server } from "socket.io";
import _ from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { Server as NetServer } from "http";
import { Socket } from "net";
import type { Server as SocketIOServer } from "socket.io";

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

    // Listen for connection events
    io.on("connection", (socket) => {
      (async () => {
        const sockets = await io.fetchSockets();
        console.log(
          `${new Date().toISOString()} Socket ${socket.id} connected. Count: ${sockets.length}`
        );
      })();

      socket.on("joinRoom", (room) => {
        socket.join(room);
        console.log(`${new Date().toISOString()} Socket ${socket.id} joined room ${room}`);
        socket.to(room).emit("roomSize", io.sockets.adapter.rooms.get(room).size);
      });

      socket.on("disconnect", () => {
        (async () => {
          const sockets = await io.fetchSockets();
          console.log(
            `${new Date().toISOString()} Socket ${socket.id} disconnected. Count: ${sockets.length}`
          );
          // fire new counts to all rooms
          const rooms = io.sockets.adapter.rooms;
          rooms.forEach((value, key) => {
            socket.to(key).emit("roomSize", value.size);
          });
        })();
      });
    });

    res.socket.server.io = io;

    // store the io instance as a global variable so it can be accessed by other server endpoints
    global.__socketio__ = io;
  }
  res.end();
};

export default SocketHandler;

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

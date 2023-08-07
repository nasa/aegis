import { Server } from "socket.io";
import _ from "lodash";
import { NextApiRequest } from "next";
import { Server as NetServer } from "http";
import type {
  NextApiResponseServerIO,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "typings/socketio";

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
      console.log(`Socket ${socket.id} connected.`);

      // Listen for incoming messages and broadcast to all clients
      socket.on("message", (message) => {
        io.emit("message", message);
      });

      // Clean up the socket on disconnect
      socket.on("disconnect", () => {
        console.log(`Socket ${socket.id} disconnected.`);
      });
    });
    res.socket.server.io = io;
  }
  res.end();
};

export default SocketHandler;

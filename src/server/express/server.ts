import dotenv from "dotenv";
dotenv.config({ override: true });
import { createServer, Server as NetServer } from "http";
import { Server as SocketServer } from "socket.io";
import app from "./restApi";

import _ from "lodash";
import { setupSocketIO } from "./sockets";
import { globalValues } from "./global";
import { getORM } from "utils/mikro";

// start the database connection
getORM();

// parent http server
const server: NetServer = createServer();

// express request handler
server.on("request", app);

// socket.io socket handler
console.log("*Starting Socket.IO");
globalValues.socketio = new SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  transports: ["websocket"],
  path: "/api/v1/socketio",
  addTrailingSlash: false,
});

setupSocketIO();

server.listen(4001, () => {
  console.log(`http server (re)started`);
});

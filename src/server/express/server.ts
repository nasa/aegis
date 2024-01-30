import dotenv from "dotenv";
dotenv.config();
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

// hard-coded port to 3000 for simplicity until more flexibility needed
server.listen(3000, () => {
  console.log(`http server (re)started`);
});

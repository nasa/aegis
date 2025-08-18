import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { createServer, Server as NetServer } from "http";
import { Server as SocketServer } from "socket.io";
import type { DefaultEventsMap } from "socket.io";
import app from "./restApi";

import { setupSocketIO } from "./sockets";
import { globalValues } from "./global";
import { getORM } from "utils/mikro";
import serverLogger from "utils/logging/serverLogger";
import packageJson from "../../../package.json";

// start the database connection
getORM();

// parent http server
const server: NetServer = createServer();

// socket.io socket handler
console.log("*Starting Socket.IO");
globalValues.socketio = new SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  {}
>(server, {
  transports: ["websocket"],
  path: "/api/v1/socketio",
  addTrailingSlash: false,
});
globalValues.appVersion = {
  version: packageJson.version || "unknown version",
  gitCommit: process.env.CI_COMMIT_SHA || "LOCAL_DEV",
};

setupSocketIO();

// express request handler
server.on("request", app);

server.listen(4001, () => {
  serverLogger.info({ logId: "api-restart" });
});

import "utils/loadEnv";
import { createServer, Server as NetServer } from "http";
import { Server as SocketServer } from "socket.io";
import type { DefaultEventsMap } from "socket.io";
import app from "./restApi";

import { setupSocketIO } from "./sockets";
import { globalValues } from "./global";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import serverLogger from "utils/logging/serverLogger";

// Wrap in async IIFE to handle top-level await
(async () => {
  // start the database connection
  globalValues.orm = await MikroORM.init(config);

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
  // these values are defined in esbuild.mjs and populated at build time
  globalValues.appVersion = {
    version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    gitCommit: typeof __GIT_COMMIT__ !== "undefined" ? __GIT_COMMIT__ : "unknown",
  };

  setupSocketIO();

  // express request handler
  server.on("request", app);

  server.listen(4001, () => {
    serverLogger.info({ logId: "api-restart" });
  });
})();

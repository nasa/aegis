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

  const gracefulShutdown = async () => {
    console.info("Gracefully shutting down server...");

    let hasErrors = false;

    // Set shutdown timeout to prevent hanging
    const shutdownTimeout = setTimeout(() => {
      console.error("Shutdown timeout - forcing exit");
      process.exit(1);
    }, 30000); // 30 seconds
    shutdownTimeout.unref(); // Don't keep process alive just for this

    // Stop socket status interval
    if (globalValues.socketInterval) {
      clearInterval(globalValues.socketInterval);
      globalValues.socketInterval = null;
      console.info("Global socket status interval stopped");
    }

    // Close Socket.IO connections
    if (globalValues.socketio) {
      try {
        await new Promise<void>((resolve) => {
          globalValues.socketio.close(() => {
            console.info("Socket.IO server closed");
            resolve();
          });
        });
      } catch (err) {
        console.error("Error closing Socket.IO:", err);
        hasErrors = true;
      }
    }

    // Close HTTP server (if Socket.IO didn't already close it)
    if (server.listening) {
      console.info("Closing HTTP server...");
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              reject(err);
            } else {
              console.info("HTTP server closed");
              resolve();
            }
          });
        });
      } catch (err) {
        console.error("Error closing HTTP server:", err);
        hasErrors = true;
      }
    } else {
      console.info("HTTP server already closed (by Socket.IO)");
    }

    // Close database connections
    try {
      if (globalValues.orm) {
        await globalValues.orm.close();
        console.info("Database connections closed");
      }
    } catch (err) {
      console.error("Error closing database connection:", err);
      hasErrors = true;
    }

    clearTimeout(shutdownTimeout);
    console.info("Shutdown complete");
    process.exit(hasErrors ? 1 : 0);
  };

  // Handle process events
  if (typeof process !== "undefined") {
    process.on("message", (msg) => {
      if (msg === "shutdown") {
        gracefulShutdown().catch(console.error);
      }
    });

    // Handle termination signals
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGUSR2", gracefulShutdown);
  }
})();

import "utils/loadEnv";
import type { Server as NetServer } from "http";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import type { DefaultEventsMap } from "socket.io";
import { WebSocketServer } from "isomorphic-ws"; // included in automerge repo network websocket
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import app from "./restApi";

import { setupSocketIO } from "./sockets";
import { globalValues } from "./global";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { serverLogger } from "utils/logging/serverLogger";
import pg from "pg";
import { getAutomergeDocListing } from "./routes/docListing";
import { addDbBackupListener } from "./routes/mission";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";

// this is only required on the server since we are using esbuild. On the client, vite handles the wasm loading
initializeBase64Wasm(automergeWasmBase64);

// Wrap in async IIFE to handle top-level await
(async () => {
  // start the database connection
  globalValues.orm = await MikroORM.init(config);

  // parent http server
  const server: NetServer = createServer();

  // socket.io socket handler
  serverLogger.info({ logId: "server", logValue: "Starting Socket.IO" });
  globalValues.socketio = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    {}
  >(server, {
    transports: ["websocket"],
    path: "/api/v1/socketio",
    addTrailingSlash: false,
    // Reduce ping interval and timeout from Socket.IO defaults
    // to detect dead connections within ~10s
    pingInterval: 5000,
    pingTimeout: 5000,
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

  // setup autoMerge sync server
  const wss = new WebSocketServer({ noServer: true });

  // upgrade an already established client/server connection to a
  //    different protocol (over the same transport protocol).
  server.on("upgrade", (request, socket, head) => {
    if (request.url === "/api/v1/socketAutomerge/") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // hook up the network (socket server) and storage to a new automerge repo
  const networkAdapter = new NodeWSServerAdapter(wss);
  const dbConfig: pg.Pool = new pg.Pool({
    user: "postgres",
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
  });
  const storageAdapter: StorageAdapterInterface = new PostgresStorageAdapter(
    "automerge_native_db",
    dbConfig
  );
  // store the automerge repo in global so we can access it later on the server
  globalValues.automergeRepo = new Repo({
    network: [networkAdapter],
    storage: storageAdapter,
    /** @ts-expect-error @type {(import("@automerge/automerge-repo").PeerId)}  */
    peerId: `storage-server`,
    sharePolicy: async () => false,
  });

  // clg peers as they come and go
  globalValues.automergeRepo.networkSubsystem.on("peer", (peerPayload) => {
    serverLogger.info({
      logId: "server",
      logValue: "automerge peer connected: " + peerPayload.peerId,
    });
  });
  globalValues.automergeRepo.networkSubsystem.on("peer-disconnected", (peerPayload) => {
    serverLogger.info({
      logId: "server",
      logValue: "automerge peer disconnected: " + peerPayload.peerId,
    });
  });

  // attach db backup listeners to all existing automerge docs
  getAutomergeDocListing().then(async (docListings) => {
    // process sequentially to avoid overwhelming the system
    for (const docInfo of docListings) {
      if (!isValidAutomergeUrl(docInfo.automergeUrl)) continue;
      // get docHandle for each document/mission and add listeners
      const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
        docInfo.automergeUrl
      );
      // wait till handler is ready in-case it has to get the doc for the first time
      await missionDocHandle.whenReady();
      const mission: Mission = missionDocHandle.doc();
      serverLogger.info({
        logId: "server",
        logValue: `attaching db backup listeners for ${mission.id}`,
      });
      addDbBackupListener(missionDocHandle);
    }
  });

  const gracefulShutdown = async () => {
    serverLogger.info({ logId: "server", logValue: "Gracefully shutting down server..." });

    let hasErrors = false;

    // Set shutdown timeout to prevent hanging
    const shutdownTimeout = setTimeout(() => {
      serverLogger.critical(
        {
          logId: "server",
          logValue: "Shutdown timeout exceeded 30s",
        },
        new Error("Shutdown timeout - forcing exit")
      );
      process.exit(1);
    }, 30000); // 30 seconds
    shutdownTimeout.unref(); // Don't keep process alive just for this

    // Shutdown automerge repo
    if (globalValues.automergeRepo) {
      try {
        await globalValues.automergeRepo.shutdown();
        serverLogger.info({ logId: "server", logValue: "Automerge repo shut down" });
      } catch (err) {
        serverLogger.error(
          { logId: "server", logValue: "Error shutting down automerge repo" },
          err instanceof Error ? err : new Error(String(err))
        );
        hasErrors = true;
      }
    }

    // Stop socket status interval
    if (globalValues.socketInterval) {
      clearInterval(globalValues.socketInterval);
      globalValues.socketInterval = null;
      serverLogger.info({ logId: "server", logValue: "Global socket status interval stopped" });
    }

    // Close Socket.IO connections
    if (globalValues.socketio) {
      try {
        await new Promise<void>((resolve) => {
          globalValues.socketio.close(() => {
            serverLogger.info({ logId: "server", logValue: "Socket.IO server closed" });
            resolve();
          });
        });
      } catch (err) {
        serverLogger.error(
          { logId: "server", logValue: "Error closing Socket.IO" },
          err instanceof Error ? err : new Error(String(err))
        );
        hasErrors = true;
      }
    }

    // Close HTTP server (if Socket.IO didn't already close it)
    if (server.listening) {
      serverLogger.info({ logId: "server", logValue: "Closing HTTP server..." });
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              reject(err);
            } else {
              serverLogger.info({ logId: "server", logValue: "HTTP server closed" });
              resolve();
            }
          });
        });
      } catch (err) {
        serverLogger.error(
          { logId: "server", logValue: "Error closing HTTP server" },
          err instanceof Error ? err : new Error(String(err))
        );
        hasErrors = true;
      }
    } else {
      serverLogger.info({ logId: "server", logValue: "HTTP server already closed (by Socket.IO)" });
    }

    // Close database connections
    try {
      if (globalValues.orm) {
        await globalValues.orm.close();
        serverLogger.info({ logId: "server", logValue: "Database connections closed" });
      }
    } catch (err) {
      serverLogger.error(
        { logId: "server", logValue: "Error closing database connection" },
        err instanceof Error ? err : new Error(String(err))
      );
      hasErrors = true;
    }

    clearTimeout(shutdownTimeout);
    serverLogger.info({ logId: "server", logValue: "Shutdown complete" });
    process.exit(hasErrors ? 1 : 0);
  };

  // Handle process events
  if (typeof process !== "undefined") {
    process.on("message", (msg) => {
      if (msg === "shutdown") {
        gracefulShutdown().catch((err) =>
          serverLogger.error(
            { logId: "server", logValue: "Error during shutdown" },
            err instanceof Error ? err : new Error(String(err))
          )
        );
      }
    });

    // Handle termination signals
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGUSR2", gracefulShutdown);
  }
})();

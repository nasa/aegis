import "utils/loadEnv";
import type { Server as NetServer } from "http";
import { createServer } from "http";
import { v4 as uuidv4 } from "uuid";
import { Server as SocketServer } from "socket.io";
import type { DefaultEventsMap } from "socket.io";
import { WebSocketServer } from "isomorphic-ws"; // included in automerge repo network websocket
import { Repo } from "@automerge/automerge-repo/slim";
import type { StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import app from "./restApi";

import { setupSocketIO } from "./sockets";
import { setupMaestroNamespace as setupMaestroNamespaceV2 } from "../maestro/v2/sockets-maestro";
import { globalValues } from "./global";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { serverLogger } from "utils/logging/serverLogger";
import pg from "pg";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { closeRasterSamplingWorkerPool } from "server/raster/rasterSamplingWorkerPool";

// this is only required on the server since we are using esbuild. On the client, vite handles the wasm loading
initializeBase64Wasm(automergeWasmBase64);

// Wrap in async IIFE to handle top-level await
(async () => {
  // ==========================================================================
  // Database connections
  // ==========================================================================

  globalValues.orm = await MikroORM.init(config);

  // Raw pg pool, shared by the server epoch read and the automerge storage adapter
  const dbConfig: pg.Pool = new pg.Pool({
    user: "postgres",
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
  });

  // ==========================================================================
  // App version
  // ==========================================================================

  const apiv1BootUuid = uuidv4();
  let postgresStartTime: string;
  try {
    const epochResult = await dbConfig.query<{ epoch: string }>(
      `select to_char(pg_postmaster_start_time() at time zone 'UTC', ` +
        `'YYYY-MM-DD"T"HH24:MI:SS.USZ') as epoch`
    );
    postgresStartTime = epochResult.rows[0]?.epoch;
    if (!postgresStartTime) {
      throw new Error("pg_postmaster_start_time() returned no rows");
    }
  } catch (error) {
    // A failure here is unrecoverable. Exit and boot and let the container restart policy retry.
    serverLogger.critical(
      { logId: "server", logValue: "Unable to read server epoch from the database" },
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(1);
  }

  const serverEpochUuid = `${postgresStartTime}|${apiv1BootUuid}`;

  // version and gitCommit are defined in esbuild.mjs and populated at build time
  globalValues.appVersion = {
    version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    gitCommit: typeof __GIT_COMMIT__ !== "undefined" ? __GIT_COMMIT__ : "unknown",
    serverEpochUuid,
  };
  serverLogger.info({
    logId: "server",
    logValue: `Server epoch: ${serverEpochUuid}`,
  });

  // ==========================================================================
  // HTTP server + Socket.IO
  // ==========================================================================

  // parent http server
  const server: NetServer = createServer();

  // Socket.IO server on /api/socket for all AEGIS internal traffic and Maegistro v2.
  serverLogger.debug({ logId: "server", logValue: "Starting Socket.IO on /api/socket" });
  globalValues.socketio = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    {}
  >(server, {
    transports: ["websocket"],
    path: "/api/socket",
    addTrailingSlash: false,
    // Reduce ping interval and timeout from Socket.IO defaults
    // to detect dead connections within ~10s
    pingInterval: 5000,
    pingTimeout: 5000,
  });

  setupSocketIO();
  // v2 Maegistro lives on the /api/socket server under the /maestro/v2 namespace.
  setupMaestroNamespaceV2(globalValues.socketio);

  // express request handler
  server.on("request", app);

  server.listen(4001, () => {
    serverLogger.info({ logId: "server", logValue: "Server listening on port 4001" });
  });

  // ==========================================================================
  // Automerge
  // ==========================================================================

  // setup autoMerge sync server
  const wss = new WebSocketServer({ noServer: true });

  // upgrade an already established client/server connection to a
  //    different protocol (over the same transport protocol).
  // Socket.IO's own upgrade listener (auto-attached during SocketServer
  // construction above) handles /api/socket; this one handles the Automerge WS.
  server.on("upgrade", (request, socket, head) => {
    let url: URL;
    try {
      // request.url is always origin-relative, so a placeholder base is required.
      url = new URL(request.url ?? "", "http://localhost");
    } catch {
      return;
    }

    // Socket.IO shares this upgrade event, so only look for the automerge socket
    // and leave everything else alone.
    if (url.pathname !== "/api/automergeSocket/") return;

    // The client appends ?serverEpochUuid=<value> from the version it was served
    // at page load. A missing or stale value means the tab predates the current
    // server, so the upgrade is refused
    const clientEpoch = url.searchParams.get("serverEpochUuid");
    if (clientEpoch !== serverEpochUuid) {
      serverLogger.warning({
        logId: "server",
        logValue: `Rejected automerge upgrade (${
          clientEpoch ? "epoch mismatch" : "no epoch supplied"
        }). client epoch: ${clientEpoch ?? "(missing)"}, server epoch: ${serverEpochUuid}`,
      });
      socket.write("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // ==========================================================================
  // Automerge repo
  // ==========================================================================

  // hook up the network (socket server) and storage to a new automerge repo
  const networkAdapter = new NodeWSServerAdapter(wss);
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
    serverLogger.debug({
      logId: "server",
      logValue: "automerge peer connected: " + peerPayload.peerId,
    });
  });
  globalValues.automergeRepo.networkSubsystem.on("peer-disconnected", (peerPayload) => {
    serverLogger.debug({
      logId: "server",
      logValue: "automerge peer disconnected: " + peerPayload.peerId,
    });
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
        serverLogger.debug({ logId: "server", logValue: "Automerge repo shut down" });
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
      serverLogger.debug({ logId: "server", logValue: "Global socket status interval stopped" });
    }

    // Close Socket.IO connections
    if (globalValues.socketio) {
      try {
        await new Promise<void>((resolve) => {
          globalValues.socketio.close(() => {
            serverLogger.debug({ logId: "server", logValue: "Socket.IO server closed" });
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
      serverLogger.debug({ logId: "server", logValue: "Closing HTTP server..." });
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              reject(err);
            } else {
              serverLogger.debug({ logId: "server", logValue: "HTTP server closed" });
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
      serverLogger.debug({
        logId: "server",
        logValue: "HTTP server already closed (by Socket.IO)",
      });
    }

    try {
      await closeRasterSamplingWorkerPool();
      serverLogger.debug({ logId: "server", logValue: "Raster sampling worker pool closed" });
    } catch (err) {
      serverLogger.error(
        { logId: "server", logValue: "Error closing raster sampling worker pool" },
        err instanceof Error ? err : new Error(String(err))
      );
      hasErrors = true;
    }

    // Close database connections
    try {
      if (globalValues.orm) {
        await globalValues.orm.close();
        serverLogger.debug({ logId: "server", logValue: "Database connections closed" });
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

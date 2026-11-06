import "utils/loadEnv";
import { watchTerrainCache } from "server/terrain/terrainProfileCache";
import { watchLanderElevation } from "server/terrain/landerElevation";
import type { Server as NetServer } from "http";
import { createServer } from "http";
import { v4 as uuidv4 } from "uuid";
import { Server as SocketServer } from "socket.io";
import type { DefaultEventsMap } from "socket.io";
import { WebSocketServer } from "isomorphic-ws"; // included in automerge repo network websocket
import { Repo } from "@automerge/automerge-repo/slim";
import { populateMissionCatalogOnce } from "server/automerge/populateMissionCatalogOnce";
import {
  loadRunningMissionDocuments,
  startMissionCatalogRuntime,
} from "server/automerge/missionCatalogRuntime";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import app from "./restApi";

import { setupSocketIO } from "./sockets";
import { rescheduleBannerTimer } from "./routes/notificationBanner";
import { setupMaestroNamespace as setupMaestroNamespaceV2 } from "../maestro/v2/sockets-maestro";
import { setupDustNamespace as setupDustNamespaceV1 } from "../dust/v1/sockets-dust";
import { globalValues } from "./global";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { serverLogger } from "utils/logging/serverLogger";
import pg from "pg";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { closeRasterSamplingWorkerPool } from "server/raster/rasterSamplingWorkerPool";
import { performance, PerformanceObserver } from "node:perf_hooks";

// this is only required on the server since we are using esbuild. On the client, vite handles the wasm loading
initializeBase64Wasm(automergeWasmBase64);

// ==========================================================================
// Main-thread stall diagnostics
// ==========================================================================

// Socket.IO and the Automerge websocket both drop every client after roughly 5–10 s without a
// heartbeat, so any synchronous work of that length on the main thread disconnects everyone.
// These diagnostics record what ran on the main thread just before such a stall.
const MAIN_THREAD_STALL_CHECK_INTERVAL_MS = 250;
const MAIN_THREAD_STALL_WARNING_MS = 1_000;
const SLOW_AUTOMERGE_OPERATION_NOTICE_MS = 250;
const SLOW_AUTOMERGE_OPERATION_WARNING_MS = 1_000;
const SLOW_GARBAGE_COLLECTION_WARNING_MS = 500;
// Operations at least this long are kept so a stall log can list what preceded it.
const RECENT_OPERATION_MINIMUM_MS = 50;
const RECENT_OPERATION_WINDOW_MS = 30_000;
const RECENT_OPERATION_MAXIMUM_ENTRIES = 200;
const DIAGNOSTICS_REPORT_INTERVAL_MS = 60_000;
const AUTOMERGE_MAIN_THREAD_TIME_NOTICE_MS_PER_REPORT = 2_000;
const MAX_SLOW_AUTOMERGE_OPERATION_LOGS_PER_REPORT = 30;

let slowAutomergeOperationLogsThisReport = 0;
let slowAutomergeOperationLogsSuppressedThisReport = 0;

const recentSlowMainThreadOperations: MainThreadOperationTiming[] = [];
let automergeOperationTotalsThisReport = new Map<string, AutomergeOperationTypeTotals>();

const recordRecentSlowMainThreadOperation = (operation: MainThreadOperationTiming): void => {
  if (operation.durationMs < RECENT_OPERATION_MINIMUM_MS) return;
  recentSlowMainThreadOperations.push(operation);
  const oldestKeptEndedAt = performance.now() - RECENT_OPERATION_WINDOW_MS;
  while (
    recentSlowMainThreadOperations.length > RECENT_OPERATION_MAXIMUM_ENTRIES ||
    (recentSlowMainThreadOperations[0] &&
      recentSlowMainThreadOperations[0].endedAt < oldestKeptEndedAt)
  )
    recentSlowMainThreadOperations.shift();
};

const missionIdForDocument = (repo: Repo, documentId: string | undefined): number | undefined => {
  if (!documentId) return undefined;
  try {
    return (repo.handles[documentId as keyof Repo["handles"]]?.doc() as Mission | undefined)?.id;
  } catch {
    return undefined;
  }
};

function startMainThreadStallDiagnostics(repo: Repo): void {
  repo.on("doc-metrics", (event) => {
    if (!("durationMillis" in event)) return;
    const peerId =
      "forPeer" in event ? event.forPeer : "fromPeer" in event ? event.fromPeer : undefined;
    const typeTotals = automergeOperationTotalsThisReport.get(event.type) ?? {
      count: 0,
      totalMs: 0,
      maxMs: 0,
    };
    typeTotals.count += 1;
    typeTotals.totalMs += event.durationMillis;
    typeTotals.maxMs = Math.max(typeTotals.maxMs, event.durationMillis);
    automergeOperationTotalsThisReport.set(event.type, typeTotals);
    recordRecentSlowMainThreadOperation({
      type: event.type,
      durationMs: event.durationMillis,
      endedAt: performance.now(),
      documentId: event.documentId,
      peerId,
    });

    if (event.durationMillis < SLOW_AUTOMERGE_OPERATION_NOTICE_MS) return;
    // Many peers can sync slowly at once after a mass reconnect; the per-minute summary still
    // counts every operation, so individual logs are capped.
    if (slowAutomergeOperationLogsThisReport >= MAX_SLOW_AUTOMERGE_OPERATION_LOGS_PER_REPORT) {
      slowAutomergeOperationLogsSuppressedThisReport += 1;
      return;
    }
    slowAutomergeOperationLogsThisReport += 1;
    const loggable = {
      logValue: `Automerge ${event.type} took ${Math.round(event.durationMillis)} ms on the main thread`,
      automergeOperation: event.type,
      durationMs: Math.round(event.durationMillis),
      documentId: event.documentId,
      missionId: missionIdForDocument(repo, event.documentId),
      peerId,
      numOps: "numOps" in event ? event.numOps : undefined,
      numChanges: "numChanges" in event ? event.numChanges : undefined,
      connectedAutomergePeers: repo.peers.length,
    };
    if (event.durationMillis >= SLOW_AUTOMERGE_OPERATION_WARNING_MS)
      serverLogger.warning({
        logId: "server:automergeDocMetrics:automergeOperationBlockedMainThreadForOverOneSecond",
        ...loggable,
      });
    else
      serverLogger.notice({
        logId: "server:automergeDocMetrics:slowAutomergeOperationOnMainThread",
        ...loggable,
      });
  });

  const garbageCollectionObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      recordRecentSlowMainThreadOperation({
        type: "garbage-collection",
        durationMs: entry.duration,
        endedAt: entry.startTime + entry.duration,
      });
      if (entry.duration >= SLOW_GARBAGE_COLLECTION_WARNING_MS)
        serverLogger.warning({
          logId: "server:garbageCollectionObserver:longGarbageCollectionPauseOnMainThread",
          logValue: `Garbage collection paused the main thread for ${Math.round(entry.duration)} ms`,
          durationMs: Math.round(entry.duration),
          heapUsedBytes: process.memoryUsage().heapUsed,
          rssBytes: process.memoryUsage.rss(),
        });
    }
  });
  garbageCollectionObserver.observe({ entryTypes: ["gc"] });

  // A timer that fires late measures how long the main thread was blocked. It reports after the
  // stall ends, by which point the operation that caused it has already recorded its duration.
  let previousStallCheckAt = performance.now();
  setInterval(() => {
    const now = performance.now();
    const stallMs = now - previousStallCheckAt - MAIN_THREAD_STALL_CHECK_INTERVAL_MS;
    previousStallCheckAt = now;
    if (stallMs < MAIN_THREAD_STALL_WARNING_MS) return;
    const stallStartedAt = now - stallMs - MAIN_THREAD_STALL_CHECK_INTERVAL_MS;
    const operationsBeforeStall = recentSlowMainThreadOperations
      .filter((operation) => operation.endedAt >= stallStartedAt - 5_000)
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 10)
      .map((operation) => ({
        type: operation.type,
        durationMs: Math.round(operation.durationMs),
        secondsBeforeStallEnded: Math.round((now - operation.endedAt) / 100) / 10,
        missionId: missionIdForDocument(repo, operation.documentId),
        peerId: operation.peerId,
      }));
    const memory = process.memoryUsage();
    serverLogger.warning({
      logId: "server:mainThreadStallMonitor:mainThreadBlockedLongEnoughToRiskDroppingSockets",
      logValue: `Main thread was blocked for about ${Math.round(stallMs)} ms`,
      stallMs: Math.round(stallMs),
      stallStartedAtIso: new Date(Date.now() - (now - stallStartedAt)).toISOString(),
      slowestOperationsBeforeStall: JSON.stringify(operationsBeforeStall),
      connectedAutomergePeers: repo.peers.length,
      connectedSocketIoClients: globalValues.socketio?.engine.clientsCount,
      loadedDocuments: Object.keys(repo.handles).length,
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
    });
  }, MAIN_THREAD_STALL_CHECK_INTERVAL_MS).unref();

  setInterval(() => {
    const automergeMainThreadMs = [...automergeOperationTotalsThisReport.values()].reduce(
      (sum, totals) => sum + totals.totalMs,
      0
    );
    if (automergeMainThreadMs >= AUTOMERGE_MAIN_THREAD_TIME_NOTICE_MS_PER_REPORT)
      serverLogger.notice({
        logId: "server:automergeDocMetrics:automergeUsedSignificantMainThreadTimeInOneMinute",
        logValue: `Automerge used ${Math.round(automergeMainThreadMs)} ms of main-thread time in the last minute`,
        automergeMainThreadMs: Math.round(automergeMainThreadMs),
        operationTotals: JSON.stringify(
          Object.fromEntries(
            [...automergeOperationTotalsThisReport.entries()].map(([type, totals]) => [
              type,
              {
                count: totals.count,
                totalMs: Math.round(totals.totalMs),
                maxMs: Math.round(totals.maxMs),
              },
            ])
          )
        ),
        connectedAutomergePeers: repo.peers.length,
        slowAutomergeOperationLogsSuppressed: slowAutomergeOperationLogsSuppressedThisReport,
      });

    automergeOperationTotalsThisReport = new Map();
    slowAutomergeOperationLogsThisReport = 0;
    slowAutomergeOperationLogsSuppressedThisReport = 0;
  }, DIAGNOSTICS_REPORT_INTERVAL_MS).unref();
}

// Wrap in async IIFE to handle top-level await
(async () => {
  const bootStarted = Date.now();
  // ==========================================================================
  // Database connections
  // ==========================================================================

  globalValues.orm = await MikroORM.init(config);

  // Raw pg pool used by the automerge storage adapter
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

  // Identifies this API process lifetime. Regenerated on every boot.
  const serverEpochUuid = uuidv4();

  // version and gitCommit are defined in esbuild.mjs and populated at build time
  globalValues.appVersion = {
    version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    gitCommit: typeof __GIT_COMMIT__ !== "undefined" ? __GIT_COMMIT__ : "unknown",
    serverEpochUuid,
  };
  serverLogger.info({
    logId: "server:startServer:serverEpochUuidGeneratedForThisServerLifetime",
    logValue: `Server epoch: ${serverEpochUuid}`,
  });

  // ==========================================================================
  // HTTP server + Socket.IO
  // ==========================================================================

  // parent http server
  const server: NetServer = createServer();

  // Socket.IO server on /api/socket for all AEGIS internal traffic and Maegistro v2.
  serverLogger.debug({
    logId: "server:startServer:startingSocketIoServerOnApiSocketPath",
    logValue: "Starting Socket.IO on /api/socket",
  });
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
  // Start the server timer for active banners
  await rescheduleBannerTimer();
  // v2 Maegistro lives on the /api/socket server under the /maestro/v2 namespace.
  setupMaestroNamespaceV2(globalValues.socketio);
  // v1 DUST lives on the /api/socket server under the /dust/v1 namespace.
  setupDustNamespaceV1(globalValues.socketio);

  // express request handler
  server.on("request", app);

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
      const forwardedFor = request.headers["x-forwarded-for"];
      const clientIp =
        (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0]?.trim()) ??
        request.socket.remoteAddress ??
        "(unknown)";
      serverLogger.warning({
        logId:
          "server:automergeUpgradeHandler:rejectedAutomergeWebSocketUpgradeDueToServerEpochMismatchOrMissingEpoch",
        logValue: `Rejected automerge upgrade (${
          clientEpoch ? "epoch mismatch" : "no epoch supplied"
        }). client epoch: ${clientEpoch ?? "(missing)"}, server epoch: ${serverEpochUuid}, client ip: ${clientIp}.`,
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
  const storageAdapter = new PostgresStorageAdapter("automerge_native_db", dbConfig);
  // store the automerge repo in global so we can access it later on the server
  const missionRepo = new Repo({
    network: [networkAdapter],
    storage: storageAdapter,
    /** @ts-expect-error @type {(import("@automerge/automerge-repo").PeerId)}  */
    peerId: `storage-server`,
    sharePolicy: async () => false,
  });
  globalValues.automergeRepo = missionRepo;
  // Start before documents load so slow loads during startup are also recorded.
  startMainThreadStallDiagnostics(missionRepo);

  // Observe storage loads before catalog population and running missions load documents.
  const missionCatalog = startMissionCatalogRuntime(missionRepo, storageAdapter);
  await populateMissionCatalogOnce(missionRepo);
  globalValues.automergeRepo.on("document", ({ handle }) => {
    watchTerrainCache(handle as DocHandle<Mission>);
    watchLanderElevation(handle as DocHandle<Mission>);
  });
  await loadRunningMissionDocuments(missionRepo);
  server.listen(4001, () => {
    serverLogger.info({
      logId: "server:httpServerListen:serverListeningOnPort4001",
      logValue: "Server listening on port 4001",
      startupMs: Date.now() - bootStarted,
      loadedDocuments: Object.keys(missionRepo.handles).length,
      rssBytes: process.memoryUsage.rss(),
    });
  });

  // clg peers as they come and go
  globalValues.automergeRepo.networkSubsystem.on("peer", (peerPayload) => {
    serverLogger.debug({
      logId: "server:automergeNetworkSubsystem:automergePeerConnected",
      logValue: "automerge peer connected: " + peerPayload.peerId,
    });
  });
  globalValues.automergeRepo.networkSubsystem.on("peer-disconnected", (peerPayload) => {
    serverLogger.debug({
      logId: "server:automergeNetworkSubsystem:automergePeerDisconnected",
      logValue: "automerge peer disconnected: " + peerPayload.peerId,
    });
  });

  const gracefulShutdown = async () => {
    serverLogger.info({
      logId: "server:gracefulShutdown:startingGracefulShutdown",
      logValue: "Gracefully shutting down server...",
    });

    let hasErrors = false;

    // Set shutdown timeout to prevent hanging
    const shutdownTimeout = setTimeout(() => {
      serverLogger.critical(
        {
          logId: "server:gracefulShutdown:shutdownTimeoutExceeded30Seconds",
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
        await missionCatalog.stop();
        serverLogger.debug({
          logId: "server:gracefulShutdown:automergeRepoShutDownSuccessfully",
          logValue: "Automerge repo shut down",
        });
      } catch (err) {
        serverLogger.error(
          {
            logId: "server:gracefulShutdown:failedToShutDownAutomergeRepo",
            logValue: "Error shutting down automerge repo",
          },
          err instanceof Error ? err : new Error(String(err))
        );
        hasErrors = true;
      }
    }

    // Stop socket status interval
    if (globalValues.socketInterval) {
      clearInterval(globalValues.socketInterval);
      globalValues.socketInterval = null;
      serverLogger.debug({
        logId: "server:gracefulShutdown:globalSocketStatusIntervalStopped",
        logValue: "Global socket status interval stopped",
      });
    }

    // Clear notification banner timer
    if (globalValues.notificationBannerTimer) {
      clearTimeout(globalValues.notificationBannerTimer);
      globalValues.notificationBannerTimer = null;
    }

    // Close Socket.IO connections
    if (globalValues.socketio) {
      try {
        await new Promise<void>((resolve) => {
          globalValues.socketio.close(() => {
            serverLogger.debug({
              logId: "server:gracefulShutdown:socketIoServerClosedSuccessfully",
              logValue: "Socket.IO server closed",
            });
            resolve();
          });
        });
      } catch (err) {
        serverLogger.error(
          {
            logId: "server:gracefulShutdown:failedToCloseSocketIoServer",
            logValue: "Error closing Socket.IO",
          },
          err instanceof Error ? err : new Error(String(err))
        );
        hasErrors = true;
      }
    }

    // Close HTTP server (if Socket.IO didn't already close it)
    if (server.listening) {
      serverLogger.debug({
        logId: "server:gracefulShutdown:closingHttpServer",
        logValue: "Closing HTTP server...",
      });
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              reject(err);
            } else {
              serverLogger.debug({
                logId: "server:gracefulShutdown:httpServerClosedSuccessfully",
                logValue: "HTTP server closed",
              });
              resolve();
            }
          });
        });
      } catch (err) {
        serverLogger.error(
          {
            logId: "server:gracefulShutdown:failedToCloseHttpServer",
            logValue: "Error closing HTTP server",
          },
          err instanceof Error ? err : new Error(String(err))
        );
        hasErrors = true;
      }
    } else {
      serverLogger.debug({
        logId: "server:gracefulShutdown:httpServerAlreadyClosedBySocketIo",
        logValue: "HTTP server already closed (by Socket.IO)",
      });
    }

    try {
      await closeRasterSamplingWorkerPool();
      serverLogger.debug({
        logId: "server:gracefulShutdown:rasterSamplingWorkerPoolClosedSuccessfully",
        logValue: "Raster sampling worker pool closed",
      });
    } catch (err) {
      serverLogger.error(
        {
          logId: "server:gracefulShutdown:failedToCloseRasterSamplingWorkerPool",
          logValue: "Error closing raster sampling worker pool",
        },
        err instanceof Error ? err : new Error(String(err))
      );
      hasErrors = true;
    }

    // Close database connections
    try {
      if (globalValues.orm) {
        await globalValues.orm.close();
        await dbConfig.end();
        serverLogger.debug({
          logId: "server:gracefulShutdown:databaseConnectionsClosedSuccessfully",
          logValue: "Database connections closed",
        });
      }
    } catch (err) {
      serverLogger.error(
        {
          logId: "server:gracefulShutdown:failedToCloseDatabaseConnections",
          logValue: "Error closing database connection",
        },
        err instanceof Error ? err : new Error(String(err))
      );
      hasErrors = true;
    }

    clearTimeout(shutdownTimeout);
    serverLogger.info({
      logId: "server:gracefulShutdown:gracefulShutdownComplete",
      logValue: "Shutdown complete",
    });
    process.exit(hasErrors ? 1 : 0);
  };

  // Handle process events
  if (typeof process !== "undefined") {
    process.on("message", (msg) => {
      if (msg === "shutdown") {
        gracefulShutdown().catch((err) =>
          serverLogger.error(
            {
              logId: "server:processShutdownMessage:unhandledErrorDuringGracefulShutdown",
              logValue: "Error during shutdown",
            },
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

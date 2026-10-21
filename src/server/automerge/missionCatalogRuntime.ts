import type { AutomergeUrl, DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import { getUnindexedMissionListings, projectMission } from "./missionCatalog";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { LazyMissionRepo } from "./lazyMissionRepo";
import type { PostgresStorageAdapter } from "./automerge-storage-adapter-postgres";

export const refreshMissionCatalog = projectMission;

/** One-time backfill. Clean startup performs only the SQL listing query. */
export async function repairMissionCatalog(repo: Repo, missionIds?: number[]): Promise<void> {
  const backfillStarted = Date.now();
  serverLogger.info({
    logId: "mission-catalog",
    logValue: "Checking for missing or outdated mission summaries",
  });
  const pending = (await getUnindexedMissionListings()).filter(
    (listing) => !missionIds || missionIds.includes(listing.missionId)
  );
  if (!pending.length) {
    serverLogger.info({
      logId: "mission-catalog",
      logValue: "Catalog is current; startup loaded no documents",
      durationMs: Date.now() - backfillStarted,
    });
    return;
  }
  serverLogger.info({
    logId: "mission-catalog",
    logValue: "Starting sequential mission catalog backfill",
    missions: pending.length,
    scanMs: Date.now() - backfillStarted,
  });
  for (const [index, listing] of pending.entries()) {
    const started = Date.now();
    serverLogger.info({
      logId: "mission-catalog",
      logValue: "Backfill mission started",
      missionId: listing.missionId,
      automergeUrl: listing.automergeUrl,
      progress: index + 1,
      total: pending.length,
    });
    try {
      const handle = await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
      await refreshMissionCatalog(repo, handle);
      await repo.removeFromCache(handle.documentId);
      serverLogger.info({
        logId: "mission-catalog",
        logValue: "Backfill mission indexed and released",
        missionId: listing.missionId,
        documentId: handle.documentId,
        durationMs: Date.now() - started,
        progress: index + 1,
        total: pending.length,
        rssBytes: process.memoryUsage.rss(),
      });
    } catch (error) {
      serverLogger.error(
        {
          logId: "mission-catalog",
          logValue: "Backfill failed; server will not accept clients",
          missionId: listing.missionId,
          automergeUrl: listing.automergeUrl,
          durationMs: Date.now() - started,
          completed: index,
          total: pending.length,
        },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
  serverLogger.info({
    logId: "mission-catalog",
    logValue: "Catalog backfill complete",
    missions: pending.length,
    durationMs: Date.now() - backfillStarted,
  });
}

// HTTP requests can retain a doc across awaits. Don't evict while any request is in flight.
let activeRequests = 0;
export function retainMissionDocuments(): () => void {
  activeRequests += 1;
  let released = false;
  return () => {
    if (!released) activeRequests -= 1;
    released = true;
  };
}

/**
 * Save/open notifications queue only the affected document. No database polling or durable queue.
 * Queue work outside storage.save(): projection flushes the repo and must not block its own save.
 */
export function startMissionCatalogRuntime(
  repo: LazyMissionRepo,
  storage: PostgresStorageAdapter,
  idleMs = 15 * 60 * 1000
): {
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
} {
  let running: Promise<void> | undefined;
  let maintenance: Promise<void> | undefined;
  let stopped = false;
  const queued = new Set<DocumentId>();
  const lastSeen = new Map<DocumentId, number>();
  const inUse = () =>
    activeRequests > 0 ||
    repo.peers.length > 0 ||
    globalValues.serverSocketStatus.visitorsData.length > 0 ||
    globalValues.maestroV2.docHandles.size > 0 ||
    globalValues.dustV1.docHandles.size > 0;

  const reportError = (
    error: unknown,
    operation: "update" | "eviction",
    documentId?: DocumentId
  ) => {
    serverLogger.error(
      {
        logId: "mission-catalog",
        logValue:
          operation === "update"
            ? "Queued catalog update failed; next save/load will retry"
            : "Idle document eviction failed; next housekeeping pass will retry",
        operation,
        documentId,
        queuedDocuments: queued.size,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  };
  const drain = (): Promise<void> => {
    if (running) return running;
    running = Promise.resolve()
      .then(async () => {
        while (queued.size) {
          const id = queued.values().next().value;
          queued.delete(id);
          const handle = repo.handles[id] as DocHandle<Mission> | undefined;
          if (handle?.isReady()) {
            try {
              await refreshMissionCatalog(repo, handle);
            } catch (error) {
              reportError(error, "update", id);
            }
          } else {
            serverLogger.debug({
              logId: "mission-catalog",
              logValue: "Queued update skipped; document is absent or not ready",
              documentId: id,
              handlePresent: !!handle,
              queuedDocuments: queued.size,
            });
          }
        }
      })
      .finally(() => {
        running = undefined;
        if (queued.size && !stopped && !maintenance) drain();
      });
    return running;
  };
  const enqueue = (id: DocumentId, source: "save" | "load") => {
    if (stopped) return;
    lastSeen.set(id, Date.now());
    const coalesced = queued.has(id);
    queued.add(id);
    serverLogger.debug({
      logId: "mission-catalog",
      logValue: "Mission catalog update queued",
      documentId: id,
      source,
      coalesced,
      queuedDocuments: queued.size,
      projectionRunning: !!running,
      evictionRunning: !!maintenance,
    });
    if (!maintenance) drain();
  };
  storage.onDocumentSaved = (id) => enqueue(id, "save");
  repo.onDocumentLoaded = (id) => enqueue(id, "load");
  serverLogger.info({
    logId: "mission-catalog",
    logValue: "Catalog runtime started; listening for document save/load events",
    idleMs,
    housekeepingIntervalMs: 60_000,
  });

  const evictIdle = async () => {
    const started = Date.now();
    let candidates = 0;
    let evicted = 0;
    let retained = 0;
    for (const [idString, handle] of Object.entries(repo.handles)) {
      const id = idString as DocumentId;
      if (!lastSeen.has(id)) lastSeen.set(id, Date.now());
      const lastUsed = Math.max(lastSeen.get(id), repo.lastAccess.get(id) ?? 0);
      if (Date.now() - lastUsed < idleMs || !handle.isReady()) continue;
      candidates += 1;
      // Conservatively retain documents while any Automerge peer is connected. A peer can
      // still hold old handles after navigation. Also retain integration and HTTP consumers.
      if (inUse()) {
        retained += 1;
        continue;
      }
      serverLogger.debug({
        logId: "mission-load",
        logValue: "Idle document eviction started",
        documentId: id,
        idleDurationMs: Date.now() - lastUsed,
      });
      try {
        await refreshMissionCatalog(repo, handle);
        if (inUse() || (repo.lastAccess.get(id) ?? 0) > lastUsed) {
          retained += 1;
          serverLogger.debug({
            logId: "mission-load",
            logValue: "Idle eviction cancelled; document or clients became active",
            documentId: id,
          });
          continue;
        }
        await repo.removeFromCache(id);
        lastSeen.delete(id);
        repo.lastAccess.delete(id);
        evicted += 1;
        serverLogger.info({
          logId: "mission-load",
          logValue: "Idle document indexed and evicted",
          documentId: id,
          residentDocuments: Object.keys(repo.handles).length,
          rssBytes: process.memoryUsage.rss(),
        });
      } catch (error) {
        reportError(error, "eviction", id);
        throw error;
      }
    }
    serverLogger.debug({
      logId: "mission-load",
      logValue: "Idle document housekeeping complete",
      candidates,
      evicted,
      retained,
      residentDocuments: Object.keys(repo.handles).length,
      activeRequests,
      peers: repo.peers.length,
      visitors: globalValues.serverSocketStatus.visitorsData.length,
      maestroHandles: globalValues.maestroV2.docHandles.size,
      dustHandles: globalValues.dustV1.docHandles.size,
      durationMs: Date.now() - started,
    });
    for (const id of lastSeen.keys()) {
      if (!repo.handles[id]) {
        lastSeen.delete(id);
        repo.lastAccess.delete(id);
      }
    }
  };
  const refresh = () => {
    maintenance ??= drain()
      .then(evictIdle)
      .finally(() => {
        maintenance = undefined;
        if (queued.size && !stopped) drain();
      });
    return maintenance;
  };
  // Memory housekeeping only. No index queries or projection unless a handle is being evicted.
  const timer = setInterval(() => {
    refresh().catch((error) => reportError(error, "eviction"));
  }, 60_000);
  timer.unref();
  return {
    refresh,
    stop: async () => {
      const started = Date.now();
      serverLogger.info({
        logId: "mission-catalog",
        logValue: "Stopping catalog runtime; draining queued updates",
        queuedDocuments: queued.size,
        projectionRunning: !!running,
        evictionRunning: !!maintenance,
      });
      clearInterval(timer);
      stopped = true;
      storage.onDocumentSaved = undefined;
      repo.onDocumentLoaded = undefined;
      await maintenance;
      await running;
      // The caller stops network writers and flushes the repo before draining the queue.
      await drain();
      serverLogger.info({
        logId: "mission-catalog",
        logValue: "Catalog runtime stopped",
        durationMs: Date.now() - started,
      });
    },
  };
}

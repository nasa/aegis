import type { AutomergeUrl, DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import { getUnindexedMissionListings, projectMission } from "./missionCatalog";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { LazyMissionRepo } from "./lazyMissionRepo";
import type { PostgresStorageAdapter } from "./automerge-storage-adapter-postgres";

export const refreshMissionCatalog = projectMission;

/** One-time backfill. Clean startup performs only the SQL listing query. */
export async function repairMissionCatalog(repo: Repo, missionIds?: number[]): Promise<void> {
  const started = Date.now();
  const pending = (await getUnindexedMissionListings()).filter(
    (listing) => !missionIds || missionIds.includes(listing.missionId)
  );
  if (!pending.length) {
    serverLogger.info({
      logId: "mission-catalog",
      logValue: "Catalog ready; no documents loaded at startup",
      durationMs: Date.now() - started,
    });
    return;
  }
  serverLogger.info({
    logId: "mission-catalog",
    logValue: `Repairing ${pending.length} mission summaries sequentially`,
  });
  for (const listing of pending) {
    const handle = await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
    await refreshMissionCatalog(repo, handle);
    await repo.removeFromCache(handle.documentId);
  }
  serverLogger.info({
    logId: "mission-catalog",
    logValue: "Catalog backfill complete",
    missions: pending.length,
    durationMs: Date.now() - started,
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
  let updates = 0;
  let failedUpdates = 0;
  let updateMs = 0;
  let maxUpdateMs = 0;
  let evicted = 0;
  // Report activity on the existing housekeeping interval, without querying the database.
  const reportActivity = () => {
    if (!updates && !failedUpdates && !evicted) return;
    serverLogger[maxUpdateMs >= 1000 ? "warning" : "info"]({
      logId: "mission-catalog",
      logValue: "Catalog activity since last report",
      updates,
      failedUpdates,
      averageUpdateMs: updates ? Math.round(updateMs / updates) : 0,
      maxUpdateMs,
      evicted,
      residentDocuments: Object.keys(repo.handles).length,
    });
    updates = failedUpdates = updateMs = maxUpdateMs = evicted = 0;
  };
  const lastSeen = new Map<DocumentId, number>();
  const inUse = () =>
    activeRequests > 0 ||
    repo.peers.length > 0 ||
    globalValues.serverSocketStatus.visitorsData.length > 0 ||
    globalValues.maestroV2.docHandles.size > 0 ||
    globalValues.dustV1.docHandles.size > 0;

  const reportError = (error: unknown, documentId?: DocumentId) => {
    serverLogger.error(
      {
        logId: "mission-catalog",
        logValue: "Catalog update failed; next save/open will retry",
        documentId,
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
            const started = Date.now();
            try {
              await refreshMissionCatalog(repo, handle);
              const durationMs = Date.now() - started;
              updates += 1;
              updateMs += durationMs;
              maxUpdateMs = Math.max(maxUpdateMs, durationMs);
            } catch (error) {
              failedUpdates += 1;
              reportError(error, id);
            }
          }
        }
      })
      .finally(() => {
        running = undefined;
        if (queued.size && !stopped && !maintenance) drain();
      });
    return running;
  };
  const enqueue = (id: DocumentId) => {
    if (stopped) return;
    lastSeen.set(id, Date.now());
    queued.add(id);
    if (!maintenance) drain();
  };
  storage.onDocumentSaved = enqueue;
  repo.onDocumentLoaded = enqueue;

  const evictIdle = async () => {
    for (const [idString, handle] of Object.entries(repo.handles)) {
      const id = idString as DocumentId;
      if (!lastSeen.has(id)) lastSeen.set(id, Date.now());
      const lastUsed = Math.max(lastSeen.get(id), repo.lastAccess.get(id) ?? 0);
      if (Date.now() - lastUsed < idleMs || !handle.isReady()) continue;
      // Conservatively retain documents while any Automerge peer is connected. A peer can
      // still hold old handles after navigation. Also retain integration and HTTP consumers.
      if (inUse()) continue;
      await refreshMissionCatalog(repo, handle);
      if (inUse() || (repo.lastAccess.get(id) ?? 0) > lastUsed) continue;
      await repo.removeFromCache(id);
      evicted += 1;
      lastSeen.delete(id);
      repo.lastAccess.delete(id);
    }
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
    refresh()
      .catch((error) => {
        serverLogger.error(
          { logId: "mission-catalog", logValue: "Idle document housekeeping failed" },
          error instanceof Error ? error : new Error(String(error))
        );
      })
      .finally(reportActivity);
  }, 60_000);
  timer.unref();
  return {
    refresh,
    stop: async () => {
      clearInterval(timer);
      stopped = true;
      storage.onDocumentSaved = undefined;
      repo.onDocumentLoaded = undefined;
      await maintenance;
      await running;
      // The caller stops network writers and flushes the repo before draining the queue.
      await drain();
      reportActivity();
    },
  };
}

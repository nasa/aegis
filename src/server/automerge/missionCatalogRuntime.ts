import type { AutomergeUrl, DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import {
  getRunningMissionListings,
  getUnindexedMissionListings,
  projectMission,
} from "./missionCatalog";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { LazyMissionRepo } from "./lazyMissionRepo";
import type { PostgresStorageAdapter } from "./automerge-storage-adapter-postgres";

export const refreshMissionCatalog = projectMission;
export const MISSION_IDLE_MS = 4 * 60 * 60 * 1000;

export async function loadRunningMissionDocuments(repo: Repo): Promise<void> {
  for (const listing of await getRunningMissionListings()) {
    await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
  }
}

/** One-time backfill. An up-to-date catalog needs only the SQL listing query. */
export async function repairMissionCatalog(repo: Repo, missionIds?: number[]): Promise<void> {
  const started = Date.now();
  const pending = (await getUnindexedMissionListings()).filter(
    (listing) => !missionIds || missionIds.includes(listing.missionId)
  );
  if (!pending.length) {
    serverLogger.info({
      logId: "mission-catalog",
      logValue: "Catalog ready; no backfill needed",
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
    await refreshMissionCatalog(repo, handle, undefined, true);
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
 * Save/open notifications check only the affected document's indexed fields. Unrelated edits
 * never reach the database. No database polling or durable queue.
 * Queue work outside storage.save(): projection flushes the repo and must not block its own save.
 */
export function startMissionCatalogRuntime(
  repo: LazyMissionRepo,
  storage: PostgresStorageAdapter,
  idleMs = MISSION_IDLE_MS
): {
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
} {
  let running: Promise<void> | undefined;
  let maintenance: Promise<void> | undefined;
  let stopped = false;
  const queued = new Set<DocumentId>();
  const lastSeen = new Map<DocumentId, number>();
  const pinned = new Set<DocumentId>();
  const inUse = (handle: DocHandle<Mission>) => {
    const mission = handle.doc();
    return (
      Object.values(mission.rexes ?? {}).some((rex) => rex.isRunning) ||
      globalValues.serverSocketStatus.visitorsData.some(
        (visitor) => visitor.missionId === mission.id
      ) ||
      (globalValues.maestroV2.visitorData[mission.id]?.length ?? 0) > 0 ||
      (globalValues.dustV1.visitorData[mission.id]?.length ?? 0) > 0 ||
      [
        ...globalValues.maestroV2.docHandles.values(),
        ...globalValues.dustV1.docHandles.values(),
      ].some((retained) => retained.documentId === handle.documentId)
    );
  };
  for (const handle of Object.values(repo.handles)) {
    lastSeen.set(handle.documentId, repo.lastAccess.get(handle.documentId) ?? Date.now());
    if (handle.isReady() && inUse(handle)) pinned.add(handle.documentId);
  }

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
            try {
              await refreshMissionCatalog(repo, handle);
            } catch (error) {
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
    // Persistence (including our own eviction flush) is not new user activity.
    // LazyMissionRepo records actual reads and changes independently of saves.
    if (!lastSeen.has(id)) lastSeen.set(id, repo.lastAccess.get(id) ?? Date.now());
    const handle = repo.handles[id];
    if (handle?.isReady() && inUse(handle)) pinned.add(id);
    queued.add(id);
    if (!maintenance) drain();
  };
  storage.onDocumentSaved = enqueue;
  repo.onDocumentLoaded = enqueue;

  const evictIdle = async () => {
    for (const [idString, handle] of Object.entries(repo.handles)) {
      const id = idString as DocumentId;
      if (!handle.isReady()) continue;
      if (inUse(handle)) {
        pinned.add(id);
        continue;
      }
      // Start a full grace period when the last pin disappears. Detecting the transition
      // on this minute's sweep errs on the side of keeping the document a little longer.
      if (pinned.delete(id)) lastSeen.set(id, Date.now());
      if (!lastSeen.has(id)) lastSeen.set(id, repo.lastAccess.get(id) ?? Date.now());
      const lastUsed = Math.max(lastSeen.get(id), repo.lastAccess.get(id) ?? 0);
      if (Date.now() - lastUsed < idleMs || activeRequests > 0) continue;
      const document = handle.doc();
      // Unrelated edits skip projection, but their source document still needs saving.
      await repo.flush([handle.documentId]);
      await refreshMissionCatalog(repo, handle);
      if (inUse(handle)) {
        pinned.add(id);
        continue;
      }
      if (
        activeRequests > 0 ||
        handle.doc() !== document ||
        Math.max(lastSeen.get(id), repo.lastAccess.get(id) ?? 0) > lastUsed
      )
        continue;
      await repo.removeFromCache(id);
      lastSeen.delete(id);
      repo.lastAccess.delete(id);
      pinned.delete(id);
    }
    for (const id of lastSeen.keys()) {
      if (!repo.handles[id]) {
        lastSeen.delete(id);
        repo.lastAccess.delete(id);
        pinned.delete(id);
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
    refresh().catch((error) => {
      serverLogger.error(
        { logId: "mission-catalog", logValue: "Idle document housekeeping failed" },
        error instanceof Error ? error : new Error(String(error))
      );
    });
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
    },
  };
}

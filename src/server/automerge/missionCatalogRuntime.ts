import type { AutomergeUrl, DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import { getRunningMissionListings, projectMission } from "./missionCatalog";
import { releaseMissionDocument } from "./releaseMissionDocument";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { LazyMissionRepo } from "./lazyMissionRepo";
import type { PostgresStorageAdapter } from "./automerge-storage-adapter-postgres";

export const refreshMissionCatalog = projectMission;
export const MISSION_IDLE_MS = 4 * 60 * 60 * 1000;
export const MISSION_CATALOG_DEBOUNCE_MS = 3_000;

export async function loadRunningMissionDocuments(repo: Repo): Promise<void> {
  for (const listing of await getRunningMissionListings()) {
    await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
  }
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
 * Save/open notifications debounce checks of each document's indexed fields. Unrelated edits
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
  // Document IDs awaiting a catalog update; repeated save notifications share one entry.
  const pendingCatalogWrites = new Set<DocumentId>();
  const catalogDebounces = new Map<DocumentId, ReturnType<typeof setTimeout>>();
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
  const processPendingCatalogWrites = (): Promise<void> => {
    if (running) return running;
    running = Promise.resolve()
      .then(async () => {
        while (pendingCatalogWrites.size) {
          const id = pendingCatalogWrites.values().next().value;
          pendingCatalogWrites.delete(id);
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
        if (pendingCatalogWrites.size && !stopped && !maintenance) processPendingCatalogWrites();
      });
    return running;
  };
  const markCatalogWritePending = (id: DocumentId) => {
    if (stopped) return;
    // Persistence (including our own eviction flush) is not new user activity.
    // LazyMissionRepo records actual reads and changes independently of saves.
    if (!lastSeen.has(id)) lastSeen.set(id, repo.lastAccess.get(id) ?? Date.now());
    const handle = repo.handles[id];
    if (handle?.isReady() && inUse(handle)) pinned.add(id);
    clearTimeout(catalogDebounces.get(id));
    // A new save also postpones work queued behind another document's projection.
    pendingCatalogWrites.delete(id);
    const debounce = setTimeout(() => {
      catalogDebounces.delete(id);
      pendingCatalogWrites.add(id);
      if (!maintenance) processPendingCatalogWrites();
    }, MISSION_CATALOG_DEBOUNCE_MS);
    debounce.unref();
    catalogDebounces.set(id, debounce);
  };
  const flushCatalogDebounces = () => {
    for (const [id, debounce] of catalogDebounces) {
      clearTimeout(debounce);
      pendingCatalogWrites.add(id);
    }
    catalogDebounces.clear();
  };
  storage.onDocumentSaved = markCatalogWritePending;
  repo.onDocumentLoaded = markCatalogWritePending;

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
      await releaseMissionDocument(repo, id);
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
  const refresh = (flushPending = true) => {
    if (flushPending) flushCatalogDebounces();
    maintenance ??= processPendingCatalogWrites()
      .then(evictIdle)
      .finally(() => {
        maintenance = undefined;
        if (pendingCatalogWrites.size && !stopped) processPendingCatalogWrites();
      });
    return maintenance;
  };
  // Memory housekeeping only. No index queries or projection unless a handle is being evicted.
  const timer = setInterval(() => {
    refresh(false).catch((error) => {
      serverLogger.error(
        { logId: "mission-catalog", logValue: "Idle document housekeeping failed" },
        error instanceof Error ? error : new Error(String(error))
      );
    });
  }, 60_000);
  timer.unref();
  return {
    refresh: () => refresh(),
    stop: async () => {
      clearInterval(timer);
      stopped = true;
      storage.onDocumentSaved = undefined;
      repo.onDocumentLoaded = undefined;
      flushCatalogDebounces();
      await maintenance;
      await running;
      // The caller stops network writers and flushes the repo before processing pending writes.
      await processPendingCatalogWrites();
    },
  };
}

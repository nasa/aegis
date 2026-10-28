import type {
  AutomergeUrl,
  DocHandle,
  DocumentId,
  Repo,
  RepoEvents,
} from "@automerge/automerge-repo/slim";
import { getRunningMissionListings, createMissionSummary } from "./missionCatalog";
import { releaseMissionDocument } from "./releaseMissionDocument";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { PostgresStorageAdapter } from "./automerge-storage-adapter-postgres";

export const refreshMissionCatalog = createMissionSummary;
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
 * Queue work outside storage.save(): summary creation flushes the repo and must not block its own save.
 */
export function startMissionCatalogRuntime(
  repo: Repo,
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
  // Start a grace period when a mission is first observed unused. Reads, edits and saves
  // do not extend it; a connected consumer or running REX keeps the mission loaded.
  const unusedSince = new Map<DocumentId, number>();
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
    if (handle.isReady() && !inUse(handle)) unusedSince.set(handle.documentId, Date.now());
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
    const handle = repo.handles[id];
    if (handle?.isReady()) {
      if (inUse(handle)) unusedSince.delete(id);
      else if (!unusedSince.has(id)) unusedSince.set(id, Date.now());
    }
    clearTimeout(catalogDebounces.get(id));
    // A new save also postpones work queued behind another document's summary creation.
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
  const onDocMetrics: RepoEvents["doc-metrics"] = (event) => {
    if (event.type === "doc-loaded") {
      serverLogger.debug({
        logId: "mission-load",
        logValue: "Loaded mission document into memory",
        documentId: event.documentId,
        durationMs: event.durationMillis,
      });
      markCatalogWritePending(event.documentId);
    }
  };
  storage.onDocumentSaved = markCatalogWritePending;
  repo.on("doc-metrics", onDocMetrics);

  const evictIdle = async () => {
    for (const [idString, handle] of Object.entries(repo.handles)) {
      const id = idString as DocumentId;
      if (!handle.isReady()) continue;
      if (inUse(handle)) {
        unusedSince.delete(id);
        continue;
      }
      // Detecting the last consumer's departure on this minute's sweep errs on the
      // side of keeping the document a little longer.
      if (!unusedSince.has(id)) unusedSince.set(id, Date.now());
      const idleStarted = unusedSince.get(id);
      if (Date.now() - idleStarted < idleMs || activeRequests > 0) continue;
      const document = handle.doc();
      // Unrelated edits skip summary creation, but their source document still needs saving.
      await repo.flush([handle.documentId]);
      await refreshMissionCatalog(repo, handle);
      if (inUse(handle)) {
        unusedSince.delete(id);
        continue;
      }
      if (activeRequests > 0 || handle.doc() !== document || unusedSince.get(id) !== idleStarted)
        continue;
      await releaseMissionDocument(repo, id);
      unusedSince.delete(id);
    }
    for (const id of unusedSince.keys()) {
      if (!repo.handles[id]) unusedSince.delete(id);
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
  // Memory housekeeping only. No index queries or summary creation unless a handle is being evicted.
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
      repo.off("doc-metrics", onDocMetrics);
      flushCatalogDebounces();
      await maintenance;
      await running;
      // The caller stops network writers and flushes the repo before processing pending writes.
      await processPendingCatalogWrites();
    },
  };
}

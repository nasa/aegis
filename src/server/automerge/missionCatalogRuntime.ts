import type { AutomergeUrl, DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import { getPendingMissionListings, projectMission } from "./missionCatalog";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { LazyMissionRepo } from "./lazyMissionRepo";

export async function refreshMissionCatalog(repo: Repo, handle: DocHandle<Mission>): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await projectMission(repo, handle)) return;
  }
  throw new Error(`Mission catalog kept changing during projection: ${handle.url}`);
}

/** One-time backfill / crash recovery. Clean startup performs only the SQL listing query. */
export async function repairMissionCatalog(repo: Repo, missionIds?: number[]): Promise<void> {
  const pending = (await getPendingMissionListings()).filter(
    (listing) => !missionIds || missionIds.includes(listing.missionId)
  );
  if (!pending.length) return;
  serverLogger.info({
    logId: "mission-catalog",
    logValue: `Repairing ${pending.length} mission summaries sequentially`,
  });
  for (const listing of pending) {
    const started = Date.now();
    const handle = await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
    await refreshMissionCatalog(repo, handle);
    await repo.removeFromCache(handle.documentId);
    serverLogger.info({
      logId: "mission-catalog",
      logValue: `Indexed mission ${listing.missionId} in ${Date.now() - started} ms`,
    });
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
 * Project durable changes, including remote sync, imports and direct server edits. The storage
 * trigger is the durable queue: no reliance on Repo's currently non-emitted `document` event,
 * or on its save metrics (which fire BEFORE the database write completes).
 */
export function startMissionCatalogRuntime(
  repo: LazyMissionRepo,
  idleMs = 15 * 60 * 1000
): {
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
} {
  let running: Promise<void> | undefined;
  const lastSeen = new Map<DocumentId, number>();
  const inUse = () =>
    activeRequests > 0 ||
    repo.peers.length > 0 ||
    globalValues.serverSocketStatus.visitorsData.length > 0 ||
    globalValues.maestroV2.docHandles.size > 0 ||
    globalValues.dustV1.docHandles.size > 0;

  const tick = async () => {
    const pending = await getPendingMissionListings();
    const failures: unknown[] = [];
    for (const listing of pending) {
      const id = listing.automergeUrl.slice("automerge:".length) as DocumentId;
      const handle = repo.handles[id] as DocHandle<Mission> | undefined;
      // Unloaded historical documents stay cold. Startup repaired all pre-existing markers;
      // normal writes come through this repo and therefore have a resident handle.
      if (handle?.isReady()) {
        lastSeen.set(id, Date.now());
        try {
          await refreshMissionCatalog(repo, handle);
        } catch (error) {
          // One busy/failing mission must not prevent other summaries from advancing.
          failures.push(error);
        }
      }
    }

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
      lastSeen.delete(id);
      repo.lastAccess.delete(id);
    }
    for (const id of lastSeen.keys()) {
      if (!repo.handles[id]) {
        lastSeen.delete(id);
        repo.lastAccess.delete(id);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Mission catalog refresh failures");
  };
  const refresh = () => {
    if (running) return running;
    running = tick()
      .catch((error) => {
        serverLogger.error(
          { logId: "mission-catalog", logValue: "Catalog refresh failed; will retry" },
          error
        );
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  };
  const timer = setInterval(() => {
    refresh();
  }, 1000);
  timer.unref();
  return {
    refresh,
    stop: async () => {
      clearInterval(timer);
      await running;
      // The caller stops network writers and flushes the repo before this final pass.
      await tick();
    },
  };
}

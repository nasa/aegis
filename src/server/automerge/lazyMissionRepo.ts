import { Repo, interpretAsDocumentId } from "@automerge/automerge-repo/slim";
import type { AnyDocumentId, DocHandle, DocumentId } from "@automerge/automerge-repo/slim";
import { serverLogger } from "utils/logging/serverLogger";

/** Bound cold-load concurrency on small servers; warm missions never wait behind cold ones. */
export class LazyMissionRepo extends Repo {
  readonly lastAccess = new Map<DocumentId, number>();
  onDocumentLoaded?: (documentId: DocumentId) => void;
  private coldLoads: Promise<unknown> = Promise.resolve();
  private pendingColdLoads = 0;

  override find<T>(
    id: AnyDocumentId,
    options?: Parameters<Repo["find"]>[1]
  ): Promise<DocHandle<T>> {
    const documentId = interpretAsDocumentId(id);
    this.lastAccess.set(documentId, Date.now());
    // In-flight handles must also bypass the queue: an incoming sync message may be what
    // makes a pending find ready. Queuing that message behind the find would deadlock it.
    const existing = this.handles[documentId];
    if (existing) {
      serverLogger.debug({
        logId: "mission-load",
        logValue: "Using existing document handle",
        documentId,
        ready: existing.isReady(),
        pendingColdLoads: this.pendingColdLoads,
      });
      const found = super.find<T>(id, options);
      if (existing.isReady()) return found;
      return found.then((handle) => {
        this.onDocumentLoaded?.(documentId);
        return handle;
      });
    }
    // Repo itself coalesces requests for the same document. Serialize cold calls (including
    // network requests) without delaying reads of already resident documents.
    const queuedAt = Date.now();
    this.pendingColdLoads += 1;
    serverLogger.debug({
      logId: "mission-load",
      logValue: "Cold document load queued",
      documentId,
      pendingColdLoads: this.pendingColdLoads,
    });
    const load = this.coldLoads.then(async () => {
      const started = Date.now();
      const queueWaitMs = started - queuedAt;
      serverLogger.info({
        logId: "mission-load",
        logValue: "Cold document load started",
        documentId,
        queueWaitMs,
        pendingColdLoads: this.pendingColdLoads,
      });
      try {
        const handle = await super.find<T>(id, options);
        this.onDocumentLoaded?.(documentId);
        const durationMs = Date.now() - started;
        serverLogger[durationMs >= 5000 ? "warning" : "info"]({
          logId: "mission-load",
          logValue: "Cold document load completed",
          documentId,
          durationMs,
          queueWaitMs,
          residentDocuments: Object.keys(this.handles).length,
          rssBytes: process.memoryUsage.rss(),
        });
        return handle;
      } catch (error) {
        serverLogger.error(
          {
            logId: "mission-load",
            logValue: "Cold document load failed",
            documentId,
            durationMs: Date.now() - started,
            queueWaitMs,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      } finally {
        this.pendingColdLoads -= 1;
      }
    });
    this.coldLoads = load.catch(() => {});
    return load;
  }
}

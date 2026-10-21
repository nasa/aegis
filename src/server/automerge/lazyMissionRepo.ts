import { Repo, interpretAsDocumentId } from "@automerge/automerge-repo/slim";
import type { AnyDocumentId, DocHandle, DocumentId } from "@automerge/automerge-repo/slim";
import { serverLogger } from "utils/logging/serverLogger";

/** Bound cold-load concurrency on small servers; warm missions never wait behind cold ones. */
export class LazyMissionRepo extends Repo {
  readonly lastAccess = new Map<DocumentId, number>();
  onDocumentLoaded?: (documentId: DocumentId) => void;
  private coldLoads: Promise<unknown> = Promise.resolve();

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
    const load = this.coldLoads.then(async () => {
      const started = Date.now();
      try {
        const handle = await super.find<T>(id, options);
        this.onDocumentLoaded?.(documentId);
        const durationMs = Date.now() - started;
        serverLogger[durationMs >= 5000 ? "warning" : "info"]({
          logId: "mission-load",
          logValue: "Mission document loaded",
          documentId,
          durationMs,
          queueWaitMs: started - queuedAt,
        });
        return handle;
      } catch (error) {
        serverLogger.error(
          {
            logId: "mission-load",
            logValue: "Mission document load failed",
            documentId,
            durationMs: Date.now() - started,
            queueWaitMs: started - queuedAt,
          },
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      }
    });
    this.coldLoads = load.catch(() => {});
    return load;
  }
}

import { Repo, interpretAsDocumentId } from "@automerge/automerge-repo/slim";
import type { AnyDocumentId, DocHandle, DocumentId } from "@automerge/automerge-repo/slim";
import { serverLogger } from "utils/logging/serverLogger";

/** Load unloaded missions one at a time; reads of loaded missions proceed immediately. */
export class LazyMissionRepo extends Repo {
  readonly lastAccess = new Map<DocumentId, number>();
  onDocumentLoaded?: (documentId: DocumentId) => void;
  private pendingDocumentLoads: Promise<unknown> = Promise.resolve();
  private readonly watched = new WeakSet<DocHandle<unknown>>();

  private watch<T>(handle: DocHandle<T>): DocHandle<T> {
    if (!this.watched.has(handle)) {
      this.watched.add(handle);
      handle.on("change", () => {
        // Count edits immediately, including remote sync, before the background save runs.
        if (this.handles[handle.documentId] === handle) {
          this.lastAccess.set(handle.documentId, Date.now());
        }
      });
    }
    this.lastAccess.set(handle.documentId, Date.now());
    return handle;
  }

  override create<T>(initialValue?: T): DocHandle<T> {
    return this.watch(super.create(initialValue));
  }

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
      if (existing.isReady()) return found.then((handle) => this.watch(handle));
      return found.then((handle) => {
        this.watch(handle);
        this.onDocumentLoaded?.(documentId);
        return handle;
      });
    }
    // Repo itself coalesces requests for the same document. Serialize loads of unloaded
    // documents (including network requests) without delaying reads of loaded documents.
    const queuedAt = Date.now();
    const load = this.pendingDocumentLoads.then(async () => {
      const started = Date.now();
      try {
        const handle = await super.find<T>(id, options);
        this.watch(handle);
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
    this.pendingDocumentLoads = load.catch(() => {});
    return load;
  }
}

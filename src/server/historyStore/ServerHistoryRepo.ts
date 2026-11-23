import { v4 as uuidv4 } from "uuid";
import { HistoryDocHandle } from "historyStore/HistoryDocHandle";
import { documentReducer } from "historyStore/documentReducer";
import { anyActionToPending, deepFreeze, reduceManyActions } from "historyStore/util";
import { serverLogger } from "utils/logging/serverLogger";
import type { ServerHistoryStore } from "./ServerHistoryStore";

/** `userId` recorded on actions made by server code (REST routes, Maestro, DUST, migrations). */
export const SERVER_USER_ID = "aegis-server";

/**
 * In-process handle used by server code. It behaves like a client of the
 * `ServerHistoryStore` without the network: `change()` is synchronous and visible at once,
 * and the insert runs in the background on a per-handle chain. `flush()` waits for it.
 */
export class ServerDocHandle<T> extends HistoryDocHandle<T> {
  private confirmedState: T | undefined;
  private pending: { action: PendingHistoryAction; next: T }[] = [];
  private localState: T | undefined;
  private chain: Promise<unknown>;

  constructor(
    documentId: HistoryDocumentId,
    private store: ServerHistoryStore<T>,
    private userId: string | number,
    started: Promise<unknown>
  ) {
    super(documentId);
    this.chain = started.catch(() => {});
  }

  doc(): T | undefined {
    return this.localState ?? this.confirmedState;
  }

  /** Called by the repo when the document is loaded or created. */
  setReady(state: T): void {
    this.confirmedState = state;
    this.markReady();
  }

  setUnavailable(error: Error): void {
    this.markUnavailable(error);
  }

  setDeleted(): void {
    this.markDeleted();
  }

  protected submit(action: { type: string; payload: { patches: HistoryPatch[] } }, next: T): void {
    const pendingAction = deepFreeze(
      anyActionToPending({
        action: { ...action, meta: { unixtime: Date.now() } },
        historyId: uuidv4(),
        userId: this.userId,
      })
    );
    this.pending.push({ action: pendingAction, next });
    this.localState = deepFreeze(next);
    this.emitChange(this.localState, action.payload.patches);
    this.chain = this.chain.then(async () => {
      const result = await this.store.insert(this.documentId, [pendingAction]);
      if (result.rejected.includes(pendingAction.historyId)) {
        serverLogger.error(
          {
            logId: "history-server-handle:submit:serverEditRejectedByHistoryStore",
            logValue: `Server edit to ${this.documentId} was rejected: ${result.error?.message ?? "did not apply to the latest state"}`,
          },
          result.error ?? new Error("History action rejected")
        );
        this.dropPending([pendingAction.historyId]);
      }
    });
  }

  /** Called by the repo for every confirmed batch on this document, from any source. */
  receiveConfirmed(confirmed: ConfirmedHistoryAction[], confirmedState: T): void {
    this.confirmedState = confirmedState;
    const ids = confirmed.map((a) => a.historyId);
    this.dropPending(ids, confirmed.flatMap((a) => a.payload?.patches ?? []));
  }

  private dropPending(historyIds: string[], patches: HistoryPatch[] = []): void {
    const ids = new Set(historyIds);
    this.pending = this.pending.filter(({ action }) => !ids.has(action.historyId));
    if (!this.pending.length) {
      this.localState = undefined;
    } else {
      const result = reduceManyActions(
        this.confirmedState,
        documentReducer as (s: T, a: BaseHistoryAction) => T,
        this.pending.map(({ action }) => action)
      );
      this.localState = deepFreeze(result.newState);
    }
    this.emitChange(this.doc(), patches);
  }

  async flush(): Promise<void> {
    let chain: Promise<unknown>;
    do {
      chain = this.chain;
      await chain;
    } while (chain !== this.chain);
  }
}

export type ServerHistoryRepoEvents = {
  document: (args: { handle: ServerDocHandle<unknown> }) => void;
  "doc-metrics": (args: {
    type: "doc-loaded";
    documentId: HistoryDocumentId;
    durationMillis: number;
  }) => void;
};

/**
 * Server replacement for the Automerge `Repo`: the registry of loaded documents. Every edit,
 * whether from a browser over `/history/v1` or from server code through a `ServerDocHandle`,
 * goes through the one `ServerHistoryStore`.
 */
export class ServerHistoryRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documents of any shape, like Automerge's Repo
  readonly handles: Record<HistoryDocumentId, ServerDocHandle<any>> = {};
  /** Called after every confirmed batch, like the Automerge storage adapter's save hook. */
  onDocumentSaved?: (documentId: HistoryDocumentId) => void;
  private listeners: { [K in keyof ServerHistoryRepoEvents]: Set<ServerHistoryRepoEvents[K]> } = {
    document: new Set(),
    "doc-metrics": new Set(),
  };

  constructor(readonly store: ServerHistoryStore<unknown>) {
    store.subscribe(({ documentId, confirmed, confirmedState }) => {
      this.handles[documentId]?.receiveConfirmed(confirmed, confirmedState);
      this.onDocumentSaved?.(documentId);
    });
  }

  on<K extends keyof ServerHistoryRepoEvents>(event: K, fn: ServerHistoryRepoEvents[K]): void {
    this.listeners[event].add(fn);
  }

  off<K extends keyof ServerHistoryRepoEvents>(event: K, fn: ServerHistoryRepoEvents[K]): void {
    this.listeners[event].delete(fn);
  }

  /** Server code never has network peers; kept for diagnostics written against Automerge. */
  get peers(): string[] {
    return [];
  }

  /** Load (if needed) and return a document's handle. Rejects if it does not exist. */
  async find<T>(documentId: HistoryDocumentId): Promise<ServerDocHandle<T>> {
    let handle = this.handles[documentId] as ServerDocHandle<T> | undefined;
    if (!handle) {
      const started = performance.now();
      const loading = this.store.load(documentId);
      handle = new ServerDocHandle<T>(
        documentId,
        this.store as ServerHistoryStore<T>,
        SERVER_USER_ID,
        loading
      );
      this.handles[documentId] = handle;
      const error = await loading;
      if (error) {
        delete this.handles[documentId];
        handle.setUnavailable(error);
        throw error;
      }
      handle.setReady(this.store.getConfirmedState(documentId) as T);
      for (const fn of this.listeners["doc-metrics"])
        fn({ type: "doc-loaded", documentId, durationMillis: performance.now() - started });
      for (const fn of this.listeners.document) fn({ handle: handle as ServerDocHandle<unknown> });
    }
    await handle.whenReady();
    return handle;
  }

  /**
   * Create a new document. The handle is ready immediately; edits made before the initial
   * state is persisted are queued behind it. `flush()` waits for both.
   */
  create<T>(initialState: T, documentId: HistoryDocumentId = `history:${uuidv4()}`): ServerDocHandle<T> {
    const state = deepFreeze(JSON.parse(JSON.stringify(initialState)) as T);
    const started = this.store.startEvent(documentId, state, SERVER_USER_ID);
    started.catch((err) =>
      serverLogger.error(
        {
          logId: "history-repo:create:failedToPersistNewDocument",
          logValue: `Failed to create history document ${documentId}`,
        },
        err instanceof Error ? err : new Error(String(err))
      )
    );
    const handle = new ServerDocHandle<T>(
      documentId,
      this.store as ServerHistoryStore<T>,
      SERVER_USER_ID,
      started
    );
    this.handles[documentId] = handle;
    handle.setReady(state);
    for (const fn of this.listeners.document) fn({ handle: handle as ServerDocHandle<unknown> });
    return handle;
  }

  /** Wait until every server-side edit (to the given documents, or all) is persisted. */
  async flush(documentIds?: HistoryDocumentId[]): Promise<void> {
    const ids = documentIds ?? Object.keys(this.handles);
    await Promise.all(ids.map((id) => this.handles[id]?.flush()));
  }

  /** Drop a document from memory after its edits are persisted. */
  async removeFromCache(documentId: HistoryDocumentId): Promise<void> {
    const handle = this.handles[documentId];
    if (!handle) return;
    await handle.flush();
    delete this.handles[documentId];
    await this.store.unload(documentId);
  }

  /** Permanently delete a document. */
  async delete(documentId: HistoryDocumentId): Promise<void> {
    const handle = this.handles[documentId];
    await handle?.flush();
    delete this.handles[documentId];
    await this.store.deleteDocument(documentId);
    handle?.setDeleted();
  }

  async shutdown(): Promise<void> {
    await this.flush();
  }
}

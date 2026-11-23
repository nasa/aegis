import { produceDocumentChange, DOCUMENT_PATCH } from "./documentReducer";

type Listener<T> = HistoryDocHandleEvents<T>[keyof HistoryDocHandleEvents<T>];

/**
 * A handle to one history-store document. Deliberately shaped like Automerge's `DocHandle`
 * (`doc()`, `change()`, `on("change")`, `whenReady()`), so the `apply*`/`stage*`/`op*`
 * mutation layers and every reader work unchanged on top of the history store.
 *
 * `change(fn)` runs `fn` on an Immer draft of the current document, turns the mutations into
 * patches, and submits them as one history action. The edit is visible immediately; the
 * server confirms or rejects it later. Subclasses provide the transport.
 */
export abstract class HistoryDocHandle<T> {
  readonly documentId: HistoryDocumentId;
  /** Alias of `documentId`, kept so code written against Automerge URLs still reads naturally. */
  readonly url: HistoryDocumentId;

  private listeners: { [K in keyof HistoryDocHandleEvents<T>]: Set<Listener<T>> } = {
    change: new Set(),
    delete: new Set(),
  };
  private ready = false;
  private deleted = false;
  private readyPromise: Promise<void>;
  private resolveReady: () => void;
  private rejectReady: (error: Error) => void;
  private lastEmittedDoc: T | undefined;

  protected constructor(documentId: HistoryDocumentId) {
    this.documentId = documentId;
    this.url = documentId;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Callers that never await `whenReady()` must not surface an unhandled rejection.
    this.readyPromise.catch(() => {});
  }

  /** The current document as this process sees it (including its own unconfirmed edits). */
  abstract doc(): T | undefined;

  /** Submit one already-produced change. */
  protected abstract submit(
    action: { type: string; payload: { patches: HistoryPatch[] } },
    nextState: T
  ): void;

  /** Resolves once every edit made through this handle is confirmed or rejected. */
  abstract flush(): Promise<void>;

  /** Automerge compatibility alias for `doc()`. */
  docSync(): T | undefined {
    return this.doc();
  }

  /**
   * Run one atomic mutation. Exactly one history action per call, so peers never see a
   * half-built operation. Returns the mutator's return value.
   */
  change<R = void>(fn: (doc: T) => R): R | undefined {
    const base = this.doc();
    if (!this.ready || base === undefined) {
      throw new Error(`History document ${this.documentId} is not ready`);
    }
    if (this.deleted) throw new Error(`History document ${this.documentId} was deleted`);
    const { next, result, patches } = produceDocumentChange(base, fn);
    if (patches.length) this.submit({ type: DOCUMENT_PATCH, payload: { patches } }, next);
    return result;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  isReady(): boolean {
    return this.ready && !this.deleted;
  }

  isDeleted(): boolean {
    return this.deleted;
  }

  on<K extends keyof HistoryDocHandleEvents<T>>(event: K, fn: HistoryDocHandleEvents<T>[K]): this {
    this.listeners[event].add(fn);
    return this;
  }

  off<K extends keyof HistoryDocHandleEvents<T>>(event: K, fn: HistoryDocHandleEvents<T>[K]): this {
    this.listeners[event].delete(fn);
    return this;
  }

  once<K extends keyof HistoryDocHandleEvents<T>>(event: K, fn: HistoryDocHandleEvents<T>[K]): this {
    const wrapped = ((...args: unknown[]) => {
      this.off(event, wrapped);
      (fn as (...a: unknown[]) => void)(...args);
    }) as HistoryDocHandleEvents<T>[K];
    return this.on(event, wrapped);
  }

  removeAllListeners(event?: keyof HistoryDocHandleEvents<T>): this {
    if (event) this.listeners[event].clear();
    else for (const set of Object.values(this.listeners)) set.clear();
    return this;
  }

  protected markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.lastEmittedDoc = this.doc();
    this.resolveReady();
  }

  protected markUnavailable(error: Error): void {
    this.rejectReady(error);
  }

  protected markDeleted(): void {
    if (this.deleted) return;
    this.deleted = true;
    for (const fn of [...this.listeners.delete]) (fn as () => void)();
  }

  /** Emit "change" when the visible document reference moved. */
  protected emitChange(doc: T, patches: HistoryPatch[]): void {
    if (!this.ready || doc === this.lastEmittedDoc) return;
    this.lastEmittedDoc = doc;
    for (const fn of [...this.listeners.change]) {
      try {
        (fn as HistoryDocHandleEvents<T>["change"])({ doc, patches });
      } catch (err) {
        console.error(`History document ${this.documentId}: change listener threw`, err);
      }
    }
  }
}

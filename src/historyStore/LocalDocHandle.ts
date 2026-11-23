import { HistoryDocHandle } from "./HistoryDocHandle";
import { deepFreeze } from "./util";

/**
 * An in-memory document handle with no server: every change is confirmed immediately. Runs
 * mutators through the same Immer draft and patch normalization as the real handles, so tests
 * and offline tools exercise production change semantics.
 */
export class LocalDocHandle<T> extends HistoryDocHandle<T> {
  private state: T;
  /** Every action applied through this handle, in order. */
  readonly actions: { type: string; payload: { patches: HistoryPatch[] } }[] = [];

  constructor(initialState: T, documentId: HistoryDocumentId = "local:document") {
    super(documentId);
    this.state = deepFreeze(JSON.parse(JSON.stringify(initialState)) as T);
    this.markReady();
  }

  doc(): T {
    return this.state;
  }

  protected submit(action: { type: string; payload: { patches: HistoryPatch[] } }, next: T): void {
    this.state = deepFreeze(next);
    this.actions.push(action);
    this.emitChange(this.state, action.payload.patches);
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  /** Mark the document deleted, firing "delete" listeners. */
  delete(): void {
    this.markDeleted();
  }
}

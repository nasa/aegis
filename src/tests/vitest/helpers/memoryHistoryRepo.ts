import type pg from "pg";
import { v4 as uuidv4 } from "uuid";
import { DOCUMENT_INIT, DOCUMENT_PATCH, produceDocumentChange } from "historyStore/documentReducer";
import { anyActionToPending } from "historyStore/util";
import { HistoryPersistence } from "server/historyStore/historyPersistence";
import { ServerHistoryRepo } from "server/historyStore/ServerHistoryRepo";
import { ServerHistoryStore } from "server/historyStore/ServerHistoryStore";

type Row = { action: ConfirmedHistoryAction; state: string | null };

/** In-memory `HistoryPersistence`. Values are JSON round-tripped like jsonb columns. */
export class MemoryHistoryPersistence extends HistoryPersistence {
  readonly rows = new Map<HistoryDocumentId, Row[]>();

  constructor() {
    super(null as unknown as pg.Pool);
  }

  async documentExists(documentId: HistoryDocumentId): Promise<boolean> {
    return !!this.rows.get(documentId)?.[0];
  }

  async listDocumentIds(): Promise<HistoryDocumentId[]> {
    return [...this.rows.keys()];
  }

  async selectHistoryIds(documentId: HistoryDocumentId): Promise<string[]> {
    return (this.rows.get(documentId) ?? []).map((row) => row.action.historyId);
  }

  async selectActionsFrom(
    documentId: HistoryDocumentId,
    fromIndex: number
  ): Promise<ConfirmedHistoryAction[]> {
    return (this.rows.get(documentId) ?? [])
      .slice(fromIndex)
      .map((row) => JSON.parse(JSON.stringify(row.action)));
  }

  async selectSnapshotIndices(documentId: HistoryDocumentId): Promise<number[]> {
    return (this.rows.get(documentId) ?? [])
      .flatMap((row, index) => (row.state === null ? [] : [index]))
      .reverse();
  }

  async selectSnapshot(documentId: HistoryDocumentId, historyIndex: number): Promise<unknown> {
    const state = this.rows.get(documentId)?.[historyIndex]?.state;
    return state ? JSON.parse(state) : null;
  }

  async startDocumentHistory(
    documentId: HistoryDocumentId,
    initialState: unknown,
    userId: string | number
  ): Promise<ConfirmedHistoryAction> {
    const action: ConfirmedHistoryAction = {
      type: DOCUMENT_INIT,
      historyId: uuidv4(),
      historyIndex: 0,
      userId,
      meta: { unixtime: Date.now() },
    };
    this.rows.set(documentId, [{ action, state: JSON.stringify(initialState) }]);
    return action;
  }

  async insertActions(
    documentId: HistoryDocumentId,
    actions: ConfirmedHistoryAction[],
    statePriorToFirstAction: unknown
  ): Promise<void> {
    const rows = this.rows.get(documentId);
    if (!rows) throw new Error(`History document ${documentId} not found`);
    actions.forEach((action, i) => {
      rows[action.historyIndex] = {
        action: JSON.parse(JSON.stringify(action)),
        state:
          i === 0 && statePriorToFirstAction !== undefined
            ? JSON.stringify(statePriorToFirstAction)
            : null,
      };
    });
  }

  async deleteDocumentHistory(documentId: HistoryDocumentId): Promise<void> {
    this.rows.delete(documentId);
  }
}

/** A real `ServerHistoryRepo` backed by `persistence` (in memory by default). */
export const createMemoryHistoryRepo = (
  persistence: HistoryPersistence = new MemoryHistoryPersistence()
): ServerHistoryRepo => new ServerHistoryRepo(new ServerHistoryStore<unknown>(persistence));

/**
 * Apply an edit as another client would: inserted straight into the repo's history store, so
 * server handles only see it as a confirmed remote action.
 */
export const insertRemoteChange = async <T>(
  repo: ServerHistoryRepo,
  documentId: HistoryDocumentId,
  fn: (doc: T) => void
): Promise<HistoryInsertResult> => {
  const { patches } = produceDocumentChange(repo.store.getConfirmedState(documentId) as T, fn);
  const action = anyActionToPending({
    action: { type: DOCUMENT_PATCH, payload: { patches }, meta: { unixtime: Date.now() } },
    historyId: uuidv4(),
    userId: "vitest-remote-client",
  });
  return repo.store.insert(documentId, [action]);
};

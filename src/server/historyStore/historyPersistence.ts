import type pg from "pg";
import { v4 as uuidv4 } from "uuid";
import { DOCUMENT_INIT } from "historyStore/documentReducer";

export const HISTORY_TABLE = "mission_history_db";

/**
 * PostgreSQL access for the history store. One row per confirmed action, keyed by
 * `(document_id, history_index)`. Row 0 is a no-op `document-init` action whose
 * `state_prior_to_action` is the document's initial state; every
 * `SNAPSHOT_INTERVAL`th row also stores the state prior to its action so loads can resume
 * from it. Mirrors Maestro's `document_history` table.
 */
export class HistoryPersistence {
  constructor(private pool: pg.Pool) {}

  async documentExists(documentId: HistoryDocumentId): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from ${HISTORY_TABLE} where document_id = $1 and history_index = 0`,
      [documentId]
    );
    return rows.length > 0;
  }

  async listDocumentIds(): Promise<HistoryDocumentId[]> {
    const { rows } = await this.pool.query<{ document_id: string }>(
      `select document_id from ${HISTORY_TABLE} where history_index = 0`
    );
    return rows.map((row) => row.document_id);
  }

  /** History ids of every action, by index. Cheap: never reads payloads or snapshots. */
  async selectHistoryIds(documentId: HistoryDocumentId): Promise<string[]> {
    const { rows } = await this.pool.query<{ history_index: number; history_id: string }>(
      `select history_index, action->>'historyId' as history_id from ${HISTORY_TABLE}
       where document_id = $1 order by history_index`,
      [documentId]
    );
    const ids: string[] = [];
    for (const row of rows) ids[row.history_index] = row.history_id;
    return ids;
  }

  async selectActionsFrom(
    documentId: HistoryDocumentId,
    fromIndex: number
  ): Promise<ConfirmedHistoryAction[]> {
    const { rows } = await this.pool.query<{ action: ConfirmedHistoryAction }>(
      `select action from ${HISTORY_TABLE}
       where document_id = $1 and history_index >= $2 order by history_index`,
      [documentId, fromIndex]
    );
    return rows.map((row) => row.action);
  }

  /** Indices that carry a saved snapshot, newest first. */
  async selectSnapshotIndices(documentId: HistoryDocumentId): Promise<number[]> {
    const { rows } = await this.pool.query<{ history_index: number }>(
      `select history_index from ${HISTORY_TABLE}
       where document_id = $1 and state_prior_to_action is not null order by history_index desc`,
      [documentId]
    );
    return rows.map((row) => row.history_index);
  }

  async selectSnapshot(documentId: HistoryDocumentId, historyIndex: number): Promise<unknown> {
    const { rows } = await this.pool.query<{ state: unknown }>(
      `select state_prior_to_action as state from ${HISTORY_TABLE}
       where document_id = $1 and history_index = $2`,
      [documentId, historyIndex]
    );
    return rows[0]?.state ?? null;
  }

  /** Create row 0 for a new document. */
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
    await this.pool.query(
      `insert into ${HISTORY_TABLE} (document_id, history_index, action, state_prior_to_action)
       values ($1, 0, $2, $3)`,
      [documentId, JSON.stringify(action), JSON.stringify(initialState)]
    );
    return action;
  }

  /**
   * Insert confirmed actions (index > 0) in one statement. `statePriorToFirstAction` is stored
   * on the first row when given.
   */
  async insertActions(
    documentId: HistoryDocumentId,
    actions: ConfirmedHistoryAction[],
    statePriorToFirstAction: unknown
  ): Promise<void> {
    if (actions.some((a) => a.historyIndex === 0)) {
      throw new Error("Cannot insert history index 0 this way");
    }
    const values: unknown[] = [];
    const tuples = actions.map((action, i) => {
      values.push(
        documentId,
        action.historyIndex,
        JSON.stringify(action),
        i === 0 && statePriorToFirstAction !== undefined
          ? JSON.stringify(statePriorToFirstAction)
          : null
      );
      const p = i * 4;
      return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`;
    });
    await this.pool.query(
      `insert into ${HISTORY_TABLE} (document_id, history_index, action, state_prior_to_action)
       values ${tuples.join(", ")}`,
      values
    );
  }

  async deleteDocumentHistory(documentId: HistoryDocumentId): Promise<void> {
    await this.pool.query(`delete from ${HISTORY_TABLE} where document_id = $1`, [documentId]);
  }
}

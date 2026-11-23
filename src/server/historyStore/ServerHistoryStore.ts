import { documentReducer } from "historyStore/documentReducer";
import {
  asError,
  deepFreeze,
  pendingToConfirmed,
  PromiseQueue,
  PubSub,
  reduceManyActions,
} from "historyStore/util";
import { serverLogger } from "utils/logging/serverLogger";
import type { HistoryPersistence } from "./historyPersistence";

/** Every this many actions, the state prior to the action is saved so loads can resume there. */
export const SNAPSHOT_INTERVAL = 200;

export type OnSuccessfulInsertProps<S> = {
  documentId: HistoryDocumentId;
  confirmed: ConfirmedHistoryAction[];
  confirmedState: S;
};

type EventData<S> = {
  confirmedState: S;
  actionCount: number;
  actionIds: Set<string>;
  /** Set when stored history failed to reduce: the document is read-only until repaired. */
  lockedReason?: string;
};

/**
 * Server half of the history store, ported from Maestro (`app/history/ServerHistoryStore.ts`).
 * The single source of truth: it assigns every action a sequential `historyIndex`, persists
 * it, and only then updates memory and publishes the confirmation.
 *
 * Differences from Maestro:
 * - Confirmed actions are not kept in memory, only their ids (for duplicate detection). The
 *   rare catch-up read (`getActionsSince`) goes to the database.
 * - No worker thread: reducing a patch action is cheap.
 * - The background snapshot verification/repair, document locking UI, and action
 *   disabling are not ported. A document whose history no longer reduces is held read-only in
 *   memory and logged.
 */
export class ServerHistoryStore<S> extends PubSub<OnSuccessfulInsertProps<S>> {
  private events = new Map<HistoryDocumentId, EventData<S>>();
  private queues = new Map<HistoryDocumentId, PromiseQueue>();
  private pendingLoads = new Map<HistoryDocumentId, Promise<undefined | Error>>();
  private rootReducer = documentReducer as (state: S, action: BaseHistoryAction) => S;

  constructor(private db: HistoryPersistence) {
    super();
  }

  private queueFor(documentId: HistoryDocumentId): PromiseQueue {
    let queue = this.queues.get(documentId);
    if (!queue) {
      queue = new PromiseQueue();
      this.queues.set(documentId, queue);
    }
    return queue;
  }

  isLoaded(documentId: HistoryDocumentId): boolean {
    return this.events.has(documentId);
  }

  getLoadedDocumentIds(): HistoryDocumentId[] {
    return [...this.events.keys()];
  }

  /** Load a document into memory. Concurrent calls share one load. */
  async load(documentId: HistoryDocumentId): Promise<undefined | Error> {
    if (this.events.has(documentId)) return;
    const pending = this.pendingLoads.get(documentId);
    if (pending) return pending;
    const loading = this.loadFromDatabase(documentId)
      .catch((err) => asError(err))
      .finally(() => this.pendingLoads.delete(documentId));
    this.pendingLoads.set(documentId, loading);
    return loading;
  }

  private async loadFromDatabase(documentId: HistoryDocumentId): Promise<undefined | Error> {
    const ids = await this.db.selectHistoryIds(documentId);
    if (!ids.length) return new Error(`History document ${documentId} not found`);

    // Resume from the newest snapshot instead of replaying every action from index 0.
    let resumeIndex = 0;
    let resumeState: S | null = null;
    for (const index of await this.db.selectSnapshotIndices(documentId)) {
      const snapshot = await this.db.selectSnapshot(documentId, index);
      if (snapshot) {
        resumeIndex = index;
        resumeState = snapshot as S;
        break;
      }
      serverLogger.warning({
        logId: "history-store:loadFromDatabase:resumeSnapshotUnavailable",
        logValue: `Snapshot ${index} of ${documentId} is unreadable; trying an older one`,
      });
    }
    if (resumeState === null) return new Error(`History document ${documentId} has no state`);

    const tail = await this.db.selectActionsFrom(documentId, resumeIndex);
    const result = reduceManyActions(resumeState, this.rootReducer, tail);
    const event: EventData<S> = {
      confirmedState: deepFreeze(result.newState),
      actionCount: ids.length,
      actionIds: new Set(ids.filter(Boolean)),
    };
    const missing = ids.length - event.actionIds.size;
    if (missing > 0 || result.error) {
      event.lockedReason = result.error
        ? `Stored action failed to reduce: ${result.error.message}`
        : `${missing} history index(es) are missing`;
      serverLogger.error(
        {
          logId: "history-store:loadFromDatabase:storedHistoryInvalidDocumentLockedReadOnly",
          logValue: `History document ${documentId} loaded read-only: ${event.lockedReason}`,
        },
        result.error ?? new Error(event.lockedReason)
      );
    }
    this.events.set(documentId, event);
  }

  /** Create a new document whose state starts at `initialState`. */
  async startEvent(
    documentId: HistoryDocumentId,
    initialState: S,
    userId: string | number
  ): Promise<ConfirmedHistoryAction> {
    return this.queueFor(documentId).push(async () => {
      if (this.events.has(documentId) || (await this.db.documentExists(documentId))) {
        throw new Error(`History document ${documentId} already exists`);
      }
      // JSON round-trip so memory matches what a later load reads back from jsonb.
      const state = deepFreeze(JSON.parse(JSON.stringify(initialState)) as S);
      const firstAction = await this.db.startDocumentHistory(documentId, state, userId);
      this.events.set(documentId, {
        confirmedState: state,
        actionCount: 1,
        actionIds: new Set([firstAction.historyId]),
      });
      return firstAction;
    });
  }

  /**
   * Validate, sequence, persist, then publish actions. Duplicates (by historyId) and actions
   * that fail to reduce are rejected. A database failure rejects the whole batch and leaves
   * memory unchanged.
   */
  async insert(
    documentId: HistoryDocumentId,
    actions: PendingHistoryAction[]
  ): Promise<HistoryInsertResult> {
    const event = this.events.get(documentId);
    if (!event) {
      return {
        confirmed: [],
        rejected: actions.map((a) => a.historyId),
        error: new Error("Document not loaded"),
      };
    }
    if (!actions.length) return { confirmed: [], rejected: [] };
    return this.queueFor(documentId).push(() => this.insertCriticalSection(documentId, actions));
  }

  private async insertCriticalSection(
    documentId: HistoryDocumentId,
    actions: PendingHistoryAction[]
  ): Promise<HistoryInsertResult> {
    // Re-read: the document may have been unloaded or deleted while this waited in the queue.
    const event = this.events.get(documentId);
    if (!event) {
      return {
        confirmed: [],
        rejected: actions.map((a) => a.historyId),
        error: new Error("Document not loaded"),
      };
    }
    if (event.lockedReason) {
      return {
        confirmed: [],
        rejected: actions.map((a) => a.historyId),
        error: new Error(`Document is read-only: ${event.lockedReason}`),
      };
    }

    const duplicate: string[] = [];
    const toInsert: PendingHistoryAction[] = [];
    const seen = new Set<string>();
    for (const action of actions) {
      if (event.actionIds.has(action.historyId) || seen.has(action.historyId)) {
        duplicate.push(action.historyId);
      } else {
        seen.add(action.historyId);
        toInsert.push(action);
      }
    }
    if (!toInsert.length) return { confirmed: [], rejected: duplicate };

    const result = reduceManyActions(event.confirmedState, this.rootReducer, toInsert);
    const reducerFailures = result.incompleteActions.map((a) => a.historyId);
    const confirmed = result.completeActions.map((a, i) =>
      pendingToConfirmed(a, event.actionCount + i)
    );
    if (!confirmed.length) return { confirmed: [], rejected: [...duplicate, ...reducerFailures] };

    const snapshotDue = confirmed.some((a) => a.historyIndex % SNAPSHOT_INTERVAL === 0);
    try {
      await this.db.insertActions(
        documentId,
        confirmed,
        snapshotDue ? event.confirmedState : undefined
      );
    } catch (err) {
      const error = asError(err);
      serverLogger.error(
        {
          logId: "history-store:insertCriticalSection:databaseWriteFailedActionsRejected",
          logValue: `Failed to persist ${confirmed.length} action(s) for ${documentId}`,
        },
        error
      );
      return { confirmed: [], rejected: actions.map((a) => a.historyId), error };
    }

    event.confirmedState = deepFreeze(result.newState);
    event.actionCount += confirmed.length;
    for (const a of confirmed) event.actionIds.add(a.historyId);

    this.publish({ documentId, confirmed, confirmedState: event.confirmedState });
    return { confirmed, rejected: [...duplicate, ...reducerFailures] };
  }

  getConfirmedState(documentId: HistoryDocumentId): S | undefined {
    return this.events.get(documentId)?.confirmedState;
  }

  getLatestStateAndActionNum(
    documentId: HistoryDocumentId
  ): { state: S; actionCount: number } | Error {
    const event = this.events.get(documentId);
    if (!event) return new Error("Document not loaded");
    return { state: event.confirmedState, actionCount: event.actionCount };
  }

  /** Confirmed actions from `fromIndex` to the end, read from the database. */
  async getActionsSince(
    documentId: HistoryDocumentId,
    fromIndex: number
  ): Promise<ConfirmedHistoryAction[]> {
    // Queue behind in-flight inserts so the read sees every action already confirmed.
    return this.queueFor(documentId).push(() => this.db.selectActionsFrom(documentId, fromIndex));
  }

  /** Drop a document from memory. It reloads from the database on next use. */
  async unload(documentId: HistoryDocumentId): Promise<void> {
    await this.queueFor(documentId).push(() => {
      this.events.delete(documentId);
    });
    this.queues.delete(documentId);
  }

  /** Permanently delete a document and its history. */
  async deleteDocument(documentId: HistoryDocumentId): Promise<void> {
    await this.queueFor(documentId).push(async () => {
      await this.db.deleteDocumentHistory(documentId);
      this.events.delete(documentId);
    });
    this.queues.delete(documentId);
  }
}

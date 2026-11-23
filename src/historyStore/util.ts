/**
 * Small helpers ported from Maestro's history store (`app/history`, `app/util`).
 */

/** Freeze an object and everything reachable from it. Returns the same object. */
export const deepFreeze = <T>(obj: T): T => {
  if (typeof obj !== "object" || obj === null || Object.isFrozen(obj)) return obj;
  for (const name of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[name];
    if (value && typeof value === "object") deepFreeze(value);
  }
  return Object.freeze(obj);
};

/** Serializes async work: each pushed function runs after the previous one settles. */
export class PromiseQueue {
  private tail: Promise<void> = Promise.resolve();

  async push<T>(fn: () => T | Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.tail;
    this.tail = next;
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

type PubSubHandler<P> = (payload: P) => void | Promise<void>;

/** Minimal publish/subscribe. `publish` does not await async handlers. */
export class PubSub<P> {
  private subscriptions: PubSubHandler<P>[] = [];

  subscribe(fn: PubSubHandler<P>): () => void {
    this.subscriptions.push(fn);
    return () => {
      const index = this.subscriptions.indexOf(fn);
      if (index >= 0) this.subscriptions.splice(index, 1);
    };
  }

  protected publish(payload: P): void {
    for (const fn of [...this.subscriptions]) fn(payload);
  }
}

export const asError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err));

/** Removes (or keeps) items whose `idProp` is in `ids`, in O(N + M). */
export const filterByIds = <T, K extends keyof T>(
  arr: T[],
  idProp: K,
  ids: string[],
  keep: "matches" | "nonmatches"
): T[] => {
  const idSet = new Set(ids);
  return arr.filter((item) => idSet.has(item[idProp] as string) === (keep === "matches"));
};

export const anyActionToPending = (props: {
  action: { type: string; payload?: unknown; meta?: BaseHistoryAction["meta"] };
  historyId: string;
  userId: string | number;
}): PendingHistoryAction => ({
  ...props.action,
  historyId: props.historyId,
  historyIndex: false,
  userId: props.userId,
});

export const pendingToConfirmed = (
  action: PendingHistoryAction,
  historyIndex: number
): ConfirmedHistoryAction => ({ ...action, historyIndex });

/**
 * Run actions through a reducer in order. Stops at the first error; that action and all later
 * ones are returned as `incompleteActions`.
 */
export const reduceManyActions = <S, T extends BaseHistoryAction>(
  initialState: S,
  rootReducer: (state: S, action: BaseHistoryAction) => S,
  actions: T[]
): { newState: S; error: Error | undefined; incompleteActions: T[]; completeActions: T[] } => {
  let newState = initialState;
  let error: Error | undefined;
  const incompleteActions: T[] = [];
  const completeActions: T[] = [];
  for (const action of actions) {
    if (error) {
      incompleteActions.push(action);
      continue;
    }
    try {
      newState = rootReducer(newState, action);
      completeActions.push(action);
    } catch (err) {
      error = asError(err);
      error.cause = `reduceManyActions errored during action ${action.type}|${action.historyId}`;
      incompleteActions.push(action);
    }
  }
  return { newState, error, completeActions, incompleteActions };
};

/**
 * Split newly received confirmed actions into those that can be reduced now (contiguous with
 * `nextIndex`) and those that must wait in the buffer, and list the missing indices.
 */
export const prepareActionsForConfirmation = (
  nextIndex: number,
  confirmedBuffer: ConfirmedHistoryAction[],
  newActions: ConfirmedHistoryAction[]
): {
  newBuffer: ConfirmedHistoryAction[];
  readyActions: ConfirmedHistoryAction[];
  neededIndices: number[];
} => {
  const originalNextIndex = nextIndex;
  const byId = new Map<string, ConfirmedHistoryAction>();
  for (const a of confirmedBuffer) byId.set(a.historyId, a);
  for (const a of newActions) byId.set(a.historyId, a);

  const ordered = [...byId.values()]
    .filter((a) => a.historyIndex >= nextIndex)
    .sort((a, b) => a.historyIndex - b.historyIndex);

  const newBuffer: ConfirmedHistoryAction[] = [];
  const readyActions: ConfirmedHistoryAction[] = [];
  for (const act of ordered) {
    if (act.historyIndex === nextIndex) {
      readyActions.push(act);
      nextIndex++;
    } else {
      newBuffer.push(act);
      nextIndex = -1;
    }
  }

  const neededIndices: number[] = [];
  if (newBuffer.length) {
    const firstNeeded = readyActions.length
      ? readyActions[readyActions.length - 1].historyIndex + 1
      : originalNextIndex;
    const lastBuffered = newBuffer[newBuffer.length - 1].historyIndex;
    const buffered = new Set(newBuffer.map((a) => a.historyIndex));
    for (let i = firstNeeded; i < lastBuffered; i++) if (!buffered.has(i)) neededIndices.push(i);
  }
  return { newBuffer, readyActions, neededIndices };
};

/** History document ids are opaque non-empty strings. */
export const isValidDocumentId = (id: unknown): id is HistoryDocumentId =>
  typeof id === "string" && id.length > 0;

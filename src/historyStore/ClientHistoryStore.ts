import { v4 as uuidv4 } from "uuid";
import debounce from "lodash/debounce";
import {
  anyActionToPending,
  deepFreeze,
  filterByIds,
  prepareActionsForConfirmation,
  reduceManyActions,
} from "./util";

/**
 * Client half of the history store, ported from Maestro (`app/history/ClientHistoryStore.ts`).
 *
 * Keeps three states:
 * - `confirmedState`: the server's state after every confirmed action this client has.
 * - `pendingState`: `confirmedState` plus this client's unconfirmed actions. This is what the
 *   UI sees.
 * - `confirmedBuffer`: confirmed actions that arrived out of order, held until the gap fills.
 *
 * Maestro dispatched Redux `overwriteState` actions; here every visible state change is
 * reported through `onStateChange` instead, and the document handle turns that into "change"
 * events. Partial hydration is the only mode: the client starts from the server's latest state
 * and an action count, never the full history.
 */
export class ClientHistoryStore<S> {
  private rootReducer: (state: S, action: BaseHistoryAction) => S;
  private onStateChange: (state: S, patches: HistoryPatch[]) => void;

  /** Sends actions to the server. Set by the transport. */
  private sendActionsToServer: (actions: PendingHistoryAction[]) => void = () => {};

  /** Asks the server for confirmed actions from `fromIndex`. Set by the transport. */
  private fetchActionsFrom: (fromIndex: number) => void = () => {};

  /** Number of confirmed actions this client has reduced. */
  private confirmedCount = 0;
  private confirmedState: S;
  private pendingState: S;
  private pendingActions: PendingHistoryAction[] = [];
  private confirmedBuffer: ConfirmedHistoryAction[] = [];
  private userId: string | number;

  /** Pending actions older than this are re-sent, in case a confirmation was lost. */
  private oldActionThreshold = 3000;

  private debounceResendOldActions = debounce(
    () => {
      const old = this.pendingActions.filter((a) => this.isOld(a));
      if (old.length) this.sendActionsToServer(old);
    },
    1000,
    { leading: false, trailing: true, maxWait: 3000 }
  );

  constructor(props: {
    rootReducer: (state: S, action: BaseHistoryAction) => S;
    onStateChange: (state: S, patches: HistoryPatch[]) => void;
    userId: string | number;
    confirmedState: S;
    actionCount: number;
  }) {
    this.rootReducer = props.rootReducer;
    this.onStateChange = props.onStateChange;
    this.userId = props.userId;
    this.confirmedState = deepFreeze(props.confirmedState);
    this.pendingState = this.confirmedState;
    this.confirmedCount = props.actionCount;
  }

  public setTransport(props: {
    sendActionsToServer: (actions: PendingHistoryAction[]) => void;
    fetchActionsFrom: (fromIndex: number) => void;
  }): void {
    this.sendActionsToServer = props.sendActionsToServer;
    this.fetchActionsFrom = props.fetchActionsFrom;
  }

  private isOld(action: PendingHistoryAction): boolean {
    const time = action.meta?.unixtime;
    return typeof time === "number" && time + this.oldActionThreshold < Date.now();
  }

  public getPendingState(): S {
    return this.pendingState;
  }

  public getConfirmedState(): S {
    return this.confirmedState;
  }

  public getPendingActions(): PendingHistoryAction[] {
    return [...this.pendingActions];
  }

  public getConfirmedCount(): number {
    return this.confirmedCount;
  }

  /**
   * Optimistically apply an action and send it to the server. Synchronous so the caller sees
   * its own edit immediately. `nextState` may be supplied when the caller already reduced it.
   */
  public addPending(
    action: { type: string; payload?: unknown },
    nextState?: S
  ): PendingHistoryAction | Error {
    try {
      const newState = nextState ?? this.rootReducer(this.pendingState, action as BaseHistoryAction);
      const historyAction = deepFreeze(
        anyActionToPending({
          action: { ...action, meta: { unixtime: Date.now() } },
          historyId: uuidv4(),
          userId: this.userId,
        })
      );
      this.pendingState = deepFreeze(newState);
      this.pendingActions.push(historyAction);
      this.onStateChange(this.pendingState, patchesOf([historyAction]));
      this.sendActionsToServer([historyAction]);
      return historyAction;
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Process confirmed actions from the server (from any client, including this one). Returns an
   * Error if a confirmed action fails to reduce, which means this client diverged from the
   * server and must re-hydrate.
   */
  public addConfirmed(actions: ConfirmedHistoryAction[]): undefined | Error {
    const { readyActions, newBuffer, neededIndices } = prepareActionsForConfirmation(
      this.confirmedCount,
      this.confirmedBuffer,
      actions
    );
    this.confirmedBuffer = newBuffer;
    if (neededIndices.length) this.fetchActionsFrom(neededIndices[0]);
    if (!readyActions.length) return;

    const result = reduceManyActions(this.confirmedState, this.rootReducer, readyActions);
    this.confirmedCount += result.completeActions.length;
    this.confirmedState = deepFreeze(result.newState);

    const confirmedIds = result.completeActions.map((a) => a.historyId);
    const pendingIds = this.pendingActions.map((a) => a.historyId);
    const ownActionsConfirmedInOrder =
      pendingIds.length > 0 &&
      pendingIds.length === confirmedIds.length &&
      pendingIds.every((id, i) => id === confirmedIds[i]);

    if (this.pendingActions.length === 0) {
      this.pendingState = this.confirmedState;
      this.onStateChange(this.pendingState, patchesOf(result.completeActions));
    } else if (ownActionsConfirmedInOrder) {
      // Our own edits came back unchanged: the visible state is already correct.
      this.confirmedState = this.pendingState;
      this.pendingActions = [];
    } else {
      this.pendingActions = filterByIds(this.pendingActions, "historyId", confirmedIds, "nonmatches");
      this.recalculatePendingState(patchesOf(result.completeActions));
      this.checkForOldPendingActions();
    }

    if (result.incompleteActions.length) {
      return new Error(
        `Confirmed actions failed to reduce: ${result.incompleteActions.map((a) => a.historyId).join(",")}`,
        { cause: result.error }
      );
    }
  }

  /** Drop rejected actions and rebuild the visible state without them. */
  public rejectPending(removeIds: string[]): void {
    const remaining = filterByIds(this.pendingActions, "historyId", removeIds, "nonmatches");
    if (remaining.length !== this.pendingActions.length) {
      this.pendingActions = remaining;
      this.recalculatePendingState([]);
    }
    this.checkForOldPendingActions();
  }

  /**
   * Replace the confirmed state with the server's latest state (after a reconnect gap the
   * server could not fill, or a divergence). Pending actions are kept and re-applied; the
   * server drops any it already confirmed, by `historyId`.
   */
  public resetFromLatestState(confirmedState: S, actionCount: number): void {
    this.confirmedState = deepFreeze(confirmedState);
    this.confirmedCount = actionCount;
    this.confirmedBuffer = [];
    this.recalculatePendingState([]);
  }

  /** Re-send every pending action, e.g. after reconnecting. */
  public resendPending(): void {
    if (this.pendingActions.length) this.sendActionsToServer([...this.pendingActions]);
  }

  public checkForOldPendingActions(): void {
    if (this.pendingActions.some((a) => this.isOld(a))) this.debounceResendOldActions();
  }

  private recalculatePendingState(patches: HistoryPatch[]): void {
    const result = reduceManyActions(this.confirmedState, this.rootReducer, this.pendingActions);
    if (result.incompleteActions.length) {
      // Pending edits that no longer apply on top of the server state are dropped.
      this.pendingActions = result.completeActions;
    }
    this.pendingState = deepFreeze(result.newState);
    this.onStateChange(this.pendingState, patches);
  }
}

const patchesOf = (actions: BaseHistoryAction[]): HistoryPatch[] =>
  actions.flatMap((a) => (a.payload?.patches as HistoryPatch[] | undefined) ?? []);

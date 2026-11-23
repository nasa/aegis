import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { ClientHistoryStore } from "historyStore/ClientHistoryStore";
import { HistoryDocHandle } from "historyStore/HistoryDocHandle";
import { documentReducer } from "historyStore/documentReducer";
import { clientLogger } from "utils/logging/clientLogger";

type HistorySocket = Socket<HistoryServerToClientEvents, HistoryClientToServerEvents>;

/** Browser handle: a `ClientHistoryStore` synced over the `/history/v1` Socket.IO namespace. */
export class ClientDocHandle<T> extends HistoryDocHandle<T> {
  private store: ClientHistoryStore<T> | undefined;
  private flushWaiters: (() => void)[] = [];

  constructor(
    documentId: HistoryDocumentId,
    private repo: ClientHistoryRepo
  ) {
    super(documentId);
  }

  doc(): T | undefined {
    return this.store?.getPendingState();
  }

  protected submit(action: { type: string; payload: { patches: HistoryPatch[] } }, next: T): void {
    const result = this.store.addPending(action, next);
    if (result instanceof Error) throw result;
  }

  flush(): Promise<void> {
    if (!this.store || this.store.getPendingActions().length === 0) return Promise.resolve();
    return new Promise((resolve) => this.flushWaiters.push(resolve));
  }

  /** Called with every join acknowledgement, first connect and reconnects alike. */
  hydrate(state: T, actionCount: number, userId: string | number): void {
    if (!this.store) {
      this.store = new ClientHistoryStore<T>({
        rootReducer: documentReducer,
        userId,
        confirmedState: state,
        actionCount,
        onStateChange: (doc, patches) => {
          this.emitChange(doc, patches);
          this.settleFlushWaiters();
        },
      });
      this.store.setTransport({
        sendActionsToServer: (actions) => this.repo.sendActions(this, actions),
        fetchActionsFrom: (fromIndex) => this.repo.requestActions(this, fromIndex),
      });
      this.markReady();
      return;
    }
    // Reconnected: take the server's state, then re-send anything still pending. The server
    // drops duplicates by historyId and reports them as rejected.
    this.store.resetFromLatestState(state, actionCount);
    this.store.resendPending();
  }

  receiveConfirmed(actions: ConfirmedHistoryAction[]): void {
    if (!this.store) return;
    const error = this.store.addConfirmed(actions);
    if (error) {
      clientLogger.error(
        {
          logId: "history-client:receiveConfirmed:confirmedActionsFailedToReduceRehydrating",
          logValue: `Confirmed actions failed to reduce on document ${this.documentId}; re-joining`,
        },
        error
      );
      this.repo.rejoin(this);
    }
    this.settleFlushWaiters();
  }

  receiveRejected(historyIds: string[]): void {
    if (!this.store || !historyIds.length) return;
    this.store.rejectPending(historyIds);
    this.settleFlushWaiters();
  }

  failToLoad(error: Error): void {
    this.markUnavailable(error);
  }

  deleteRemotely(): void {
    this.markDeleted();
  }

  private settleFlushWaiters(): void {
    if (!this.store || this.store.getPendingActions().length) return;
    const waiters = this.flushWaiters;
    this.flushWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

/**
 * Browser replacement for the Automerge `Repo`. Holds one handle per document and one
 * Socket.IO connection for all of them.
 */
export class ClientHistoryRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documents of any shape, like Automerge's Repo
  readonly handles: Record<HistoryDocumentId, ClientDocHandle<any>> = {};
  private socket: HistorySocket;
  private serverEpochUuid: string;
  private userId: string | number;
  private onConnectionStatusChange?: (status: ConnectionStatus) => void;

  constructor(props: {
    serverURL: string;
    serverEpochUuid: string;
    userId: string | number;
    onConnectionStatusChange?: (status: ConnectionStatus) => void;
  }) {
    this.serverEpochUuid = props.serverEpochUuid;
    this.userId = props.userId;
    this.onConnectionStatusChange = props.onConnectionStatusChange;
    this.socket = io(`${props.serverURL}/history/v1`, {
      transports: ["websocket"],
      path: "/api/socket",
      reconnectionDelayMax: 5000,
    });
    this.onConnectionStatusChange?.("connecting");
    this.socket.on("connect", () => {
      this.onConnectionStatusChange?.("connected");
      for (const handle of Object.values(this.handles)) this.join(handle);
    });
    this.socket.on("disconnect", () => this.onConnectionStatusChange?.("disconnected"));
    this.socket.io.on("reconnect_attempt", () => this.onConnectionStatusChange?.("reconnecting"));
    this.socket.on("confirmActions", ({ documentId, actions }) => {
      this.handles[documentId]?.receiveConfirmed(actions);
    });
    this.socket.on("documentDeleted", ({ documentId }) => {
      this.handles[documentId]?.deleteRemotely();
    });
  }

  /** Returns the handle for a document, joining it on first use. Resolves once it is loaded. */
  async find<T>(documentId: HistoryDocumentId): Promise<ClientDocHandle<T>> {
    const handle = this.findSync<T>(documentId);
    await handle.whenReady();
    return handle;
  }

  /** Returns the handle immediately; it becomes ready once the server sends the document. */
  findSync<T>(documentId: HistoryDocumentId): ClientDocHandle<T> {
    let handle = this.handles[documentId] as ClientDocHandle<T> | undefined;
    if (!handle) {
      handle = new ClientDocHandle<T>(documentId, this);
      this.handles[documentId] = handle;
      if (this.socket.connected) this.join(handle);
    }
    return handle;
  }

  /** Stop syncing a document and forget its handle. */
  removeFromCache(documentId: HistoryDocumentId): void {
    if (!this.handles[documentId]) return;
    delete this.handles[documentId];
    this.socket.emit("leave", { documentId });
  }

  rejoin(handle: ClientDocHandle<unknown>): void {
    this.join(handle);
  }

  sendActions(handle: ClientDocHandle<unknown>, actions: PendingHistoryAction[]): void {
    // While disconnected, actions stay pending and are re-sent after the next join.
    if (!this.socket.connected) return;
    this.socket.emit("sendActions", { documentId: handle.documentId, actions }, (res) => {
      if (res.status === "success") handle.receiveRejected(res.rejected);
      else
        clientLogger.warning({
          logId: "history-client:sendActions:serverFailedToProcessActions",
          logValue: `Server could not process actions for ${handle.documentId}: ${res.message}`,
        });
    });
  }

  requestActions(handle: ClientDocHandle<unknown>, fromIndex: number): void {
    if (!this.socket.connected) return;
    this.socket.emit("requestActions", { documentId: handle.documentId, fromIndex }, (res) => {
      if (res.status === "success") handle.receiveConfirmed(res.actions);
    });
  }

  private join(handle: ClientDocHandle<unknown>): void {
    const { documentId } = handle;
    this.socket.emit("join", { documentId, serverEpochUuid: this.serverEpochUuid }, (res) => {
      if (this.handles[documentId] !== handle) return;
      if (res.status === "success") {
        handle.hydrate(res.state, res.actionCount, this.userId);
        return;
      }
      if (res.code === "epochMismatch") {
        // The server restarted (possibly with a schema migration). Reload rather than replay
        // edits authored against the previous server's documents.
        this.socket.disconnect();
        const currentUrl = window.location.pathname + window.location.search;
        window.location.href = `/versionCheck?returnUrl=${encodeURIComponent(currentUrl)}`;
        return;
      }
      clientLogger.error(
        {
          logId: "history-client:join:serverRefusedToLoadDocument",
          logValue: `Server could not load document ${documentId}: ${res.message}`,
        },
        new Error(res.message)
      );
      handle.failToLoad(new Error(res.message));
    });
  }
}

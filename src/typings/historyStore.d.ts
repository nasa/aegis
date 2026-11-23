/**
 * History store types. Ported from Maestro's `app/history` (see docs/history-store.md).
 */

/** A string identifying one history-store document (one mission). */
type HistoryDocumentId = string;

type BaseHistoryAction = {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
  historyId: string;
  userId: string | number;
  meta?: {
    unixtime?: number;
    roundtripLatency?: number;
  };
};

type ConfirmedHistoryAction = BaseHistoryAction & {
  historyIndex: number;
};

type PendingHistoryAction = BaseHistoryAction & {
  historyIndex: false;
};

type HistoryAction = ConfirmedHistoryAction | PendingHistoryAction;

/** One Immer JSON patch, normalized so it never addresses inside an array. */
type HistoryPatch = {
  op: "replace" | "remove" | "add";
  path: (string | number)[];
  value?: unknown;
};

type HistoryInsertResult = {
  confirmed: ConfirmedHistoryAction[];
  rejected: string[];
  error?: Error;
};

/** Payload of a handle "change" event. */
type HistoryDocChangePayload<T> = {
  doc: T;
  /** Patches from the actions that produced this state, when known. */
  patches: HistoryPatch[];
};

type HistoryDocHandleEvents<T> = {
  change: (payload: HistoryDocChangePayload<T>) => void;
  delete: () => void;
};

type HistoryJoinAck =
  | { status: "success"; state: unknown; actionCount: number }
  | { status: "error"; code: "epochMismatch" | "notFound" | "error"; message: string };

type HistorySendAck = { status: "success"; rejected: string[] } | { status: "error"; message: string };

type HistoryActionsAck =
  | { status: "success"; actions: ConfirmedHistoryAction[] }
  | { status: "error"; message: string };

type HistoryClientToServerEvents = {
  join: (
    args: { documentId: HistoryDocumentId; serverEpochUuid: string },
    ack: (res: HistoryJoinAck) => void
  ) => void;
  leave: (args: { documentId: HistoryDocumentId }) => void;
  sendActions: (
    args: { documentId: HistoryDocumentId; actions: PendingHistoryAction[] },
    ack: (res: HistorySendAck) => void
  ) => void;
  requestActions: (
    args: { documentId: HistoryDocumentId; fromIndex: number },
    ack: (res: HistoryActionsAck) => void
  ) => void;
};

type HistoryServerToClientEvents = {
  confirmActions: (args: {
    documentId: HistoryDocumentId;
    actions: ConfirmedHistoryAction[];
  }) => void;
  documentDeleted: (args: { documentId: HistoryDocumentId }) => void;
};

/** A document mutator, as passed to `DocHandle.change`. */
type ChangeFn<T> = (doc: T) => void;

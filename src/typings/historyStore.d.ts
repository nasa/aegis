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

/**
 * One normalized document patch. `replace`/`remove`/`add` are Immer JSON patches that never
 * address inside an array. `list` describes an edit to an array whose elements have an identity
 * (see `normalizePatches`), so it can merge with concurrent edits to the same array.
 */
type HistoryPatch = {
  op: "replace" | "remove" | "add" | "list";
  path: (string | number)[];
  value?: unknown;
  /** `list` only: element id field, or `""` for string elements. */
  idField?: string;
  /** `list` only: ids removed by this edit. */
  removed?: string[];
  /** `list` only: elements added or changed, with their neighbors in the author's list. */
  upserts?: HistoryListUpsert[];
  /** `list` only: the author's full id order, present when kept elements were reordered. */
  order?: string[];
};

type HistoryListUpsert = {
  id: string;
  /** Id of the element before it in the author's list, or null if it was first. */
  after: string | null;
  /** Id of the element after it in the author's list, or null if it was last. */
  before?: string | null;
  value: unknown;
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

type HistorySendAck =
  { status: "success"; rejected: string[] } | { status: "error"; message: string };

type HistoryActionsAck =
  { status: "success"; actions: ConfirmedHistoryAction[] } | { status: "error"; message: string };

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

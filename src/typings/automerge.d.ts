type AutomergeDocListing = {
  missionId: number | null;
  automergeUrl: string;
};

type DocListing_db_type = AutomergeDocListing;

type DocHandle<T> = import("@automerge/automerge-repo").DocHandle<T>;

/** Main-thread time of one synchronous Automerge operation or garbage collection pause. */
type MainThreadOperationTiming = {
  type: string;
  durationMs: number;
  /** `performance.now()` when the operation finished. */
  endedAt: number;
  documentId?: string;
  peerId?: string;
};

/** Automerge websocket traffic and sync-generation time for one peer in the current report window. */
type AutomergePeerTrafficTotals = {
  bytesSent: number;
  messagesSent: number;
  bytesReceived: number;
  messagesReceived: number;
  generateSyncMessageMs: number;
  documentIds: Set<string>;
  /** Count and bytes per Automerge message type ("sync", "request", "ephemeral", ...). */
  messageTypeTotals: Record<string, { count: number; bytes: number }>;
  largestMessageSentBytes: number;
  sentSyncMessages: AutomergeSyncMessageInspection;
  receivedSyncMessages: AutomergeSyncMessageInspection;
};

/** Decoded contents of the sync messages exchanged with one peer in the current report window. */
type AutomergeSyncMessageInspection = {
  messagesInspected: number;
  messagesTooLargeToInspect: number;
  messagesWithNoChanges: number;
  changes: number;
  changeBytes: number;
  /** Changes that were an entire saved document, sent to a peer with no shared history. */
  wholeDocumentChunks: number;
  largestWholeDocumentChunkBytes: number;
  headsTotal: number;
  needTotal: number;
  haveTotal: number;
  /** SHA-256 fingerprint of each change's bytes, mapped to how many times it was seen. */
  timesEachChangeSeen: Map<string, number>;
  /** Bytes of the first few changes seen more than once, decoded when the report is logged. */
  repeatedChangeSamples: Map<string, Uint8Array>;
};

/** Count and main-thread time of one Automerge operation type in the current report window. */
type AutomergeOperationTypeTotals = { count: number; totalMs: number; maxMs: number };

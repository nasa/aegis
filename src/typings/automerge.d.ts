type AutomergeDocListing = {
  missionId: number | null;
  automergeUrl: string;
};

type DocListing_db_type = AutomergeDocListing;

/** A mission document handle, backed by the history store (`src/historyStore`). */
type DocHandle<T> = import("historyStore/HistoryDocHandle").HistoryDocHandle<T>;

/** Main-thread time of one synchronous Automerge operation or garbage collection pause. */
type MainThreadOperationTiming = {
  type: string;
  durationMs: number;
  /** `performance.now()` when the operation finished. */
  endedAt: number;
  documentId?: string;
  peerId?: string;
};

/** Count and main-thread time of one Automerge operation type in the current report window. */
type AutomergeOperationTypeTotals = { count: number; totalMs: number; maxMs: number };

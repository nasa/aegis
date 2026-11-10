/** Tunables for the Newton traverse cache, read from the environment on each use. */
interface NewtonCacheSettings {
  /** Server-wide limit on AEGIS jobs that are submitting, pending or in progress. */
  maxInFlight: number;
  /** A failed row is resubmitted once it's older than this. */
  failedTtlMs: number;
  /** An unfinished row is refreshed from Newton at most this often. */
  pollThrottleMs: number;
  /** How long Newton's map list is reused for the maps fingerprint. */
  mapsTtlMs: number;
  /** How often the background tick looks for queued rows. */
  tickMs: number;
  /** An unfinished job older than this (since submission) fails with code `timeout`. */
  maxJobAgeMs: number;
  /** A queued row nobody has asked for within this long isn't submitted. */
  abandonMs: number;
}

/** Who asked, recorded on the row the first time it's created (for stats only). */
interface NewtonCacheCaller {
  username?: string;
  missionId?: number;
}

/**
 * - `hit`: a finished row, with no Newton POST;
 * - `pending`: queued or running, with no Newton POST;
 * - `submitted`: this request posted the job to Newton.
 */
type NewtonCacheStatus = "hit" | "pending" | "submitted";

interface NewtonRequestOptions {
  /** Include Newton's raw path. */
  raw?: boolean;
  onCacheStatus?: (status: NewtonCacheStatus) => void;
}

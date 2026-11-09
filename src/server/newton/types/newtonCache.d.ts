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
}

/** Who asked, recorded on the row the first time it's created. */
interface NewtonCacheCaller {
  username?: string;
}

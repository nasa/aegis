/**
 * Database cache of Newton traverses, keyed by AEGIS's canonical request. Every Newton
 * job AEGIS starts goes through here.
 */
import { createHash, randomUUID } from "node:crypto";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { asError } from "@emss/utils";

import { Newton_Traverse_db } from "server/database/models/_allModels";
import { globalValues } from "server/express/global";
import { lineStringToAegisPoints, lonLatToAegisPoint } from "server/newton/v1/convert";
import {
  newtonCancelTraverse,
  newtonGetTraverse,
  newtonListMaps,
  newtonOptionsFromEnv,
  newtonPostTraverse,
} from "server/newton/v1/http-newton";
import { EARTH_RADIUS } from "utils/consts";
import { serverLogger } from "utils/logging/serverLogger";
import { pathSegmentDistances, simplifyPathToEndpoints } from "utils/mapping/simplifyPath";
import { canonicalNewtonRequest } from "utils/newtonInputs";

const MOON_RADIUS_M = 1_737_400;
const DEFAULT_SLOPE_RESOLUTION_M = 1;
const MAX_SUBMIT_BACKOFF_MS = 5 * 60_000;
const BASE_SUBMIT_BACKOFF_MS = 5_000;
/** A row left `submitting` this long after its timeout is assumed lost. */
const SUBMIT_GRACE_MS = 30_000;
/** Shared by every AEGIS process that claims rows, so the in-flight limit is global. */
const DEFAULT_CLAIM_LOCK_KEY = 869_986;

const IN_FLIGHT: NewtonTraverseStatus[] = ["submitting", "pending", "in_progress"];
const NEWTON_RUNNING: NewtonTraverseStatus[] = ["pending", "in_progress"];

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function newtonCacheSettings(): NewtonCacheSettings {
  return {
    maxInFlight: Math.floor(positiveEnv("NEWTON_MAX_IN_FLIGHT", 1)),
    failedTtlMs: positiveEnv("NEWTON_FAILED_TTL_MS", 24 * 60 * 60_000),
    pollThrottleMs: positiveEnv("NEWTON_POLL_THROTTLE_MS", 2_000),
    mapsTtlMs: positiveEnv("NEWTON_MAPS_TTL_MS", 60 * 60_000),
    tickMs: positiveEnv("NEWTON_TICK_MS", 10_000),
    maxJobAgeMs: positiveEnv("NEWTON_MAX_JOB_AGE_MS", 10 * 60_000),
    abandonMs: positiveEnv("NEWTON_ABANDON_MS", 60_000),
  };
}

export const isNewtonEnabled = (): boolean => !!newtonOptionsFromEnv().baseUrl;

const now = (): Date => new Date(Date.now());
const ago = (ms: number): Date => new Date(Date.now() - ms);
const fork = (): EntityManager => globalValues.orm.em.fork() as EntityManager;

const planetRadius = (planet: Newton.Planet): number =>
  planet === "earth" ? EARTH_RADIUS : MOON_RADIUS_M;

/**
 * The row key: SHA-256 of the canonical request (the client's `inputSignature`). This is
 * AEGIS's own key, not Newton's `request_hash`.
 */
export const requestKey = (problem: Newton.TraverseProblem): string =>
  createHash("sha256").update(canonicalNewtonRequest(problem)).digest("hex");

/** Half the slope map's resolution, the tolerance used when simplifying Newton's path. */
export function simplifyToleranceM(mapInfo: readonly Newton.MapInfo[] | null | undefined): number {
  const resolution = mapInfo?.find((map) => map.type === "slope")?.resolution?.[0];
  return (
    (Number.isFinite(resolution) && resolution > 0 ? resolution : DEFAULT_SLOPE_RESOLUTION_M) * 0.5
  );
}

// ── Maps fingerprint ─────────────────────────────────────────────────────────

const mapsCache = new Map<Newton.Planet, { fingerprint: string | null; fetchedAt: number }>();

/** A hash of Newton's map names and resolutions for the planet, or null if unknown. */
export async function mapsFingerprint(planet: Newton.Planet): Promise<string | null> {
  const cached = mapsCache.get(planet);
  if (cached && Date.now() - cached.fetchedAt < newtonCacheSettings().mapsTtlMs) {
    return cached.fingerprint;
  }
  const result = await newtonListMaps({ planet });
  if (result.kind !== "ok") return cached?.fingerprint ?? null;
  const names = result.data.maps
    .map((map) => `${map.type}:${map.name}:${(map.resolution ?? []).join("x")}`)
    .sort();
  const fingerprint = createHash("sha256").update(names.join("\n")).digest("hex").slice(0, 16);
  mapsCache.set(planet, { fingerprint, fetchedAt: Date.now() });
  return fingerprint;
}

export function clearMapsFingerprintCache(): void {
  mapsCache.clear();
}

let claimLockKey = DEFAULT_CLAIM_LOCK_KEY;

/** Tests running in parallel schemas use their own lock, so they don't serialise. */
export function setNewtonClaimLockKey(key: number): void {
  claimLockKey = key;
}

// ── Rows ─────────────────────────────────────────────────────────────────────

const RESULT_RESET: Partial<Newton_Traverse_db> = {
  newtonTraverseId: null,
  requestHash: null,
  deduplicated: false,
  effectiveProblem: null,
  rawPath: null,
  rawVertexCount: null,
  path: null,
  segmentDistances: null,
  mapInfo: null,
  runtimeMs: null,
  submittedAt: null,
  lastPolledAt: null,
  finishedAt: null,
};

async function findByKey(em: EntityManager, key: string): Promise<Newton_Traverse_db | null> {
  return em.findOne(Newton_Traverse_db, { requestKey: key }, { refresh: true });
}

async function findByUuid(em: EntityManager, uuid: string): Promise<Newton_Traverse_db | null> {
  return em.findOne(Newton_Traverse_db, { uuid }, { refresh: true });
}

/** Insert the row for `problem`, or return the one that already exists, marking it requested. */
async function findOrInsert(
  problem: Newton.TraverseProblem,
  caller: NewtonCacheCaller
): Promise<Newton_Traverse_db> {
  const key = requestKey(problem);
  const em = fork();
  await em.nativeUpdate(Newton_Traverse_db, { requestKey: key }, { lastRequestedAt: now() });
  const existing = await findByKey(em, key);
  if (existing) return existing;
  const timestamp = now();
  try {
    await em.insert(Newton_Traverse_db, {
      uuid: randomUUID(),
      requestKey: key,
      request: problem,
      status: "queued",
      deduplicated: false,
      submitAttempts: 0,
      firstUsername: caller.username ?? null,
      firstMissionId: caller.missionId ?? null,
      lastRequestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  } catch (error) {
    if (!(error instanceof UniqueConstraintViolationException)) throw error;
  }
  const row = await findByKey(fork(), key);
  if (!row) throw new Error("Newton traverse row vanished after insert");
  return row;
}

/** Puts a finished row back in the queue, clearing its old result. */
async function requeue(row: Newton_Traverse_db, from: NewtonTraverseStatus): Promise<void> {
  await fork().nativeUpdate(
    Newton_Traverse_db,
    { uuid: row.uuid, status: from },
    {
      ...RESULT_RESET,
      status: "queued",
      error: null,
      submitAttempts: 0,
      nextSubmitAt: null,
      mapsFingerprint: null,
      updatedAt: now(),
    }
  );
}

// ── Submitting ───────────────────────────────────────────────────────────────

/**
 * Claims a queued row for submission if a slot is free. The advisory lock serialises
 * claims, so two requests can't both take the last slot.
 */
async function claimForSubmit(uuid: string): Promise<boolean> {
  const { maxInFlight } = newtonCacheSettings();
  return fork().transactional(async (tx) => {
    await tx.execute("select pg_advisory_xact_lock(?)", [claimLockKey]);
    const inFlight = await tx.count(Newton_Traverse_db, { status: { $in: IN_FLIGHT } });
    if (inFlight >= maxInFlight) return false;
    const claimed = await tx.nativeUpdate(
      Newton_Traverse_db,
      {
        uuid,
        status: "queued",
        $or: [{ nextSubmitAt: null }, { nextSubmitAt: { $lte: now() } }],
      },
      { status: "submitting", updatedAt: now() }
    );
    return claimed === 1;
  });
}

const submitBackoffMs = (attempts: number): number =>
  Math.min(BASE_SUBMIT_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_SUBMIT_BACKOFF_MS);

/**
 * POSTs a claimed row. Returns false when Newton was unavailable, so callers stop
 * submitting more rows for now.
 */
async function submitClaimed(row: Newton_Traverse_db, onSubmitted?: () => void): Promise<boolean> {
  const fingerprint = await mapsFingerprint(row.request.planet);
  const result = await newtonPostTraverse(row.request);
  onSubmitted?.();
  const attempts = row.submitAttempts + 1;
  const em = fork();
  const where = { uuid: row.uuid, status: "submitting" as const };

  if (result.kind === "ok") {
    await em.nativeUpdate(Newton_Traverse_db, where, {
      ...RESULT_RESET,
      status: "pending",
      newtonTraverseId: result.data.traverseId,
      requestHash: result.data.requestHash,
      deduplicated: result.data.reuse === "deduplicated",
      error: null,
      mapsFingerprint: fingerprint,
      submitAttempts: attempts,
      nextSubmitAt: null,
      submittedAt: now(),
      updatedAt: now(),
    });
    serverLogger.debug({
      logId: "newton-cache:submitClaimed:submittedTraverse",
      logValue: `Row ${row.uuid} → Newton ${result.data.traverseId} (${result.data.reuse})`,
    });
    // A cached answer is already finished on Newton; fetch it in the same request.
    if (result.data.reuse === "cached") await refreshRunning(row.uuid, { force: true });
    return true;
  }

  if (result.kind === "rejected") {
    await em.nativeUpdate(Newton_Traverse_db, where, {
      status: "failed",
      error: result.error,
      submitAttempts: attempts,
      finishedAt: now(),
      updatedAt: now(),
    });
    return true;
  }

  await em.nativeUpdate(Newton_Traverse_db, where, {
    status: "queued",
    error: result.error ?? {
      code: `transient_${result.reason}`,
      message: result.message,
      details: [],
    },
    submitAttempts: attempts,
    nextSubmitAt: new Date(Date.now() + submitBackoffMs(attempts)),
    updatedAt: now(),
  });
  return false;
}

/** Submits the row now if it's queued, due, and a slot is free. */
async function trySubmit(uuid: string, onSubmitted?: () => void): Promise<boolean> {
  if (!(await claimForSubmit(uuid))) return true;
  const row = await findByUuid(fork(), uuid);
  if (!row) return true;
  try {
    return await submitClaimed(row, onSubmitted);
  } catch (error) {
    // Never leave a row stuck in `submitting`.
    await fork().nativeUpdate(
      Newton_Traverse_db,
      { uuid, status: "submitting" },
      { status: "queued", nextSubmitAt: new Date(Date.now() + BASE_SUBMIT_BACKOFF_MS) }
    );
    throw error;
  }
}

// ── Polling ──────────────────────────────────────────────────────────────────

/** Applies a Newton `GET /traverses/:id` body to the row. */
async function applyNewtonTraverse(
  row: Newton_Traverse_db,
  traverse: Newton.Traverse
): Promise<void> {
  const where = {
    uuid: row.uuid,
    newtonTraverseId: row.newtonTraverseId,
    status: { $in: NEWTON_RUNNING },
  };
  const common = {
    requestHash: traverse.request_hash ?? row.requestHash,
    effectiveProblem: traverse.effective_problem ?? null,
    updatedAt: now(),
  };

  if (traverse.status === "succeeded") {
    const raw = lineStringToAegisPoints(traverse.path);
    if (raw.length < 2) {
      await fork().nativeUpdate(Newton_Traverse_db, where, {
        ...common,
        status: "failed",
        error: { code: "invalid_path", message: "Newton returned no usable path", details: [] },
        finishedAt: now(),
      });
      return;
    }
    const waypoints = row.request.waypoints;
    const radius = planetRadius(row.request.planet);
    const path = simplifyPathToEndpoints(
      raw,
      simplifyToleranceM(traverse.map_info),
      radius,
      lonLatToAegisPoint(waypoints[0]),
      lonLatToAegisPoint(waypoints[waypoints.length - 1])
    );
    await fork().nativeUpdate(Newton_Traverse_db, where, {
      ...common,
      status: "succeeded",
      rawPath: traverse.path,
      rawVertexCount: raw.length,
      path,
      segmentDistances: pathSegmentDistances(path, radius),
      mapInfo: traverse.map_info ?? null,
      runtimeMs: traverse.runtime ?? null,
      error: null,
      finishedAt: now(),
    });
    return;
  }

  if (traverse.status === "failed") {
    await fork().nativeUpdate(Newton_Traverse_db, where, {
      ...common,
      status: "failed",
      mapInfo: traverse.map_info ?? null,
      error: traverse.error ?? {
        code: "internal_error",
        message: "Newton job failed",
        details: [],
      },
      finishedAt: now(),
    });
    return;
  }

  await fork().nativeUpdate(Newton_Traverse_db, where, {
    ...common,
    status: traverse.status,
    ...(traverse.status === "cancelled" ? { finishedAt: now() } : {}),
  });
}

/**
 * Refreshes a pending or running row from Newton. The conditional update on
 * `lastPolledAt` lets only one concurrent caller poll per throttle window.
 */
async function refreshRunning(uuid: string, { force = false } = {}): Promise<void> {
  const { pollThrottleMs } = newtonCacheSettings();
  const claimed = await fork().nativeUpdate(
    Newton_Traverse_db,
    {
      uuid,
      status: { $in: NEWTON_RUNNING },
      ...(force
        ? {}
        : { $or: [{ lastPolledAt: null }, { lastPolledAt: { $lt: ago(pollThrottleMs) } }] }),
    },
    { lastPolledAt: now() }
  );
  if (claimed !== 1) return;
  const row = await findByUuid(fork(), uuid);
  if (!row?.newtonTraverseId) return;

  const result = await newtonGetTraverse(row.newtonTraverseId);
  if (result.kind === "ok") {
    await applyNewtonTraverse(row, result.data);
  } else if (result.kind === "rejected" && result.status === 404) {
    // Newton lost the job (e.g. its database was reset). Submit it again.
    await fork().nativeUpdate(
      Newton_Traverse_db,
      { uuid, newtonTraverseId: row.newtonTraverseId, status: { $in: NEWTON_RUNNING } },
      { ...RESULT_RESET, status: "queued", nextSubmitAt: null, updatedAt: now() }
    );
  }
  await expireIfTooOld(row);
}

/**
 * A job still unfinished `maxJobAgeMs` after submission fails with code `timeout`, so a
 * hung Newton job can't hold a slot forever. The Newton job is cancelled unless it's
 * shared (`deduplicated`), since cancelling would cancel it for every caller.
 */
async function expireIfTooOld(row: Newton_Traverse_db): Promise<void> {
  const { maxJobAgeMs } = newtonCacheSettings();
  if (!row.submittedAt || row.submittedAt >= ago(maxJobAgeMs)) return;
  const expired = await fork().nativeUpdate(
    Newton_Traverse_db,
    {
      uuid: row.uuid,
      newtonTraverseId: row.newtonTraverseId,
      status: { $in: NEWTON_RUNNING },
    },
    {
      status: "failed",
      error: {
        code: "timeout",
        message: `Newton didn't finish within ${Math.round(maxJobAgeMs / 1000)} s`,
        details: [],
      },
      finishedAt: now(),
      updatedAt: now(),
    }
  );
  if (expired !== 1) return;
  serverLogger.warning({
    logId: "newton-cache:expireIfTooOld:expiredNewtonJob",
    logValue: `Row ${row.uuid}: Newton job ${row.newtonTraverseId} exceeded ${maxJobAgeMs} ms`,
  });
  if (!row.deduplicated) await newtonCancelTraverse(row.newtonTraverseId);
}

// ── Queue ────────────────────────────────────────────────────────────────────

/** Rows left `submitting` by a crash or a hung request go back to the queue. */
async function releaseStaleSubmits(olderThanMs: number): Promise<void> {
  await fork().nativeUpdate(
    Newton_Traverse_db,
    { status: "submitting", updatedAt: { $lt: ago(olderThanMs) } },
    { status: "queued", nextSubmitAt: null, updatedAt: now() }
  );
}

let pumping: Promise<void> | null = null;

/** Queued rows that are due, and that a client asked for within `abandonMs`. */
const submittableQueued = (): Record<string, unknown> => ({
  status: "queued",
  lastRequestedAt: { $gte: ago(newtonCacheSettings().abandonMs) },
  $or: [{ nextSubmitAt: null }, { nextSubmitAt: { $lte: now() } }],
});

/**
 * Refreshes in-flight rows (so finished jobs free their slot), then submits due queued
 * rows, oldest first, while slots are free. Stops at the first transient failure. Rows
 * nobody has asked for lately (superseded edits, closed tabs) wait until asked again.
 */
export function pumpNewtonQueue(): Promise<void> {
  pumping ??= (async () => {
    try {
      if (!isNewtonEnabled()) return;
      await releaseStaleSubmits(newtonOptionsFromEnv().timeoutMs + SUBMIT_GRACE_MS);
      const em = fork();
      const running = await em.find(
        Newton_Traverse_db,
        { status: { $in: NEWTON_RUNNING } },
        { fields: ["uuid"] }
      );
      for (const { uuid } of running) await refreshRunning(uuid);

      const { maxInFlight } = newtonCacheSettings();
      const queued = await em.find(Newton_Traverse_db, submittableQueued(), {
        fields: ["uuid"],
        orderBy: { createdAt: "asc" },
        limit: maxInFlight * 4,
      });
      for (const { uuid } of queued) {
        const inFlight = await em.count(Newton_Traverse_db, { status: { $in: IN_FLIGHT } });
        if (inFlight >= maxInFlight) break;
        if (!(await trySubmit(uuid))) break;
      }
    } finally {
      pumping = null;
    }
  })();
  return pumping;
}

/** Moves a row along: resubmits stale results, submits queued rows, polls running ones. */
async function advance(row: Newton_Traverse_db, onSubmitted: () => void): Promise<void> {
  const settings = newtonCacheSettings();
  switch (row.status) {
    case "succeeded": {
      const fingerprint = await mapsFingerprint(row.request.planet);
      if (fingerprint && row.mapsFingerprint && fingerprint !== row.mapsFingerprint) {
        await requeue(row, "succeeded");
        await trySubmit(row.uuid, onSubmitted);
      }
      return;
    }
    case "failed":
      if (row.finishedAt && row.finishedAt < ago(settings.failedTtlMs)) {
        await requeue(row, "failed");
        await trySubmit(row.uuid, onSubmitted);
      }
      return;
    case "cancelled":
      await requeue(row, "cancelled");
      await trySubmit(row.uuid, onSubmitted);
      return;
    case "queued":
      // A full queue may only be waiting on a job nobody is polling.
      if (!(await trySubmit(row.uuid, onSubmitted))) return;
      if ((await findByUuid(fork(), row.uuid))?.status === "queued") await pumpNewtonQueue();
      return;
    case "submitting":
      return;
    case "pending":
    case "in_progress":
      await refreshRunning(row.uuid);
      return;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function toNewtonTraverseRow(row: Newton_Traverse_db, raw = false): NewtonTraverseRow {
  const params: NewtonTraverseParams = {};
  if (row.request.slope_limit !== undefined) params.slopeLimit = row.request.slope_limit;
  if (row.request.slope_buffer_m !== undefined) params.slopeBufferM = row.request.slope_buffer_m;
  const result: NewtonTraverseRow = {
    uuid: row.uuid,
    inputSignature: canonicalNewtonRequest(row.request),
    status: row.status,
    waypoints: row.request.waypoints.map(lonLatToAegisPoint),
    params,
    requestHash: row.requestHash ?? null,
    path: row.path ?? null,
    segmentDistances: row.segmentDistances ?? null,
    rawVertexCount: row.rawVertexCount ?? null,
    mapInfo: row.mapInfo?.map(({ name, type, resolution }) => ({ name, type, resolution })) ?? null,
    runtimeMs: row.runtimeMs ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (raw) {
    const rawPath = row.rawPath as Newton.LineString | null | undefined;
    result.rawPath = rawPath ? lineStringToAegisPoints(rawPath) : null;
  }
  return result;
}

async function loadRow(uuid: string, raw: boolean): Promise<Newton_Traverse_db | null> {
  return fork().findOne(
    Newton_Traverse_db,
    { uuid },
    raw ? { populate: ["rawPath"], refresh: true } : { refresh: true }
  );
}

/**
 * Returns the cached row for `problem`, creating it if needed, and moves it along: a new
 * row is submitted when a slot is free, a running one is refreshed from Newton when due.
 * Clients poll by asking again with the same request.
 */
export async function requestNewtonTraverse(
  problem: Newton.TraverseProblem,
  caller: NewtonCacheCaller = {},
  { raw = false, onCacheStatus }: NewtonRequestOptions = {}
): Promise<NewtonTraverseRow> {
  const row = await findOrInsert(problem, caller);
  let submitted = false;
  await advanceSafely(row, () => (submitted = true));
  const latest = await loadRow(row.uuid, raw);
  if (!latest) throw new Error("Newton traverse row vanished");
  onCacheStatus?.(submitted ? "submitted" : FINISHED.includes(latest.status) ? "hit" : "pending");
  return toNewtonTraverseRow(latest, raw);
}

/** Newton trouble must not fail a read: the stored row is still the best answer. */
async function advanceSafely(row: Newton_Traverse_db, onSubmitted: () => void): Promise<void> {
  try {
    await advance(row, onSubmitted);
  } catch (error) {
    serverLogger.error(
      {
        logId: "newton-cache:advanceSafely:failedToAdvanceTraverseRow",
        logValue: `Could not advance Newton traverse ${row.uuid} (${row.status})`,
      },
      asError(error)
    );
  }
}

const FINISHED: NewtonTraverseStatus[] = ["succeeded", "failed", "cancelled"];

const ALL_STATUSES: NewtonTraverseStatus[] = [
  "queued",
  ...IN_FLIGHT,
  "succeeded",
  "failed",
  "cancelled",
];

/** Row counts by status; statuses with no rows are left out. */
export async function newtonQueueCounts(): Promise<NewtonHealthReport["counts"]> {
  const em = fork();
  const counts = await Promise.all(
    ALL_STATUSES.map(async (status): Promise<[NewtonTraverseStatus, number]> => [
      status,
      await em.count(Newton_Traverse_db, { status }),
    ])
  );
  return Object.fromEntries(counts.filter(([, count]) => count > 0));
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

let tick: NodeJS.Timeout | null = null;

/**
 * At boot: release rows a previous process left `submitting`, then start the queue tick.
 * Queued rows are submitted only once a client asks for them again.
 */
export async function startNewtonTraverseCache(): Promise<void> {
  await releaseStaleSubmits(0);
  if (!isNewtonEnabled()) return;
  const runTick = () =>
    pumpNewtonQueue().catch((error) =>
      serverLogger.error(
        {
          logId: "newton-cache:startNewtonTraverseCache:queueTickFailed",
          logValue: "Newton queue tick failed",
        },
        asError(error)
      )
    );
  await runTick();
  tick = setInterval(async () => {
    const waiting = await fork().count(Newton_Traverse_db, {
      $or: [{ status: { $in: NEWTON_RUNNING } }, submittableQueued()],
    });
    if (waiting > 0) await runTick();
  }, newtonCacheSettings().tickMs);
  tick.unref();
}

export async function stopNewtonTraverseCache(): Promise<void> {
  if (tick) clearInterval(tick);
  tick = null;
  await pumping?.catch(() => {});
}

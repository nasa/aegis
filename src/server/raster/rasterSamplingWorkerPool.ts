import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import { serverLogger } from "utils/logging/serverLogger";

import type { RasterProfileSamplingResult } from "./sampleRasterProfile";

export type RasterSamplingWorkerRequest = {
  type: "sample";
  id: number;
  descriptor: RasterDescriptor;
  path: GeographicPoint[];
  steps: number[];
};

type RasterSamplingWorkerShutdownRequest = {
  type: "shutdown";
};

export type RasterSamplingWorkerMessage =
  | RasterSamplingWorkerRequest
  | RasterSamplingWorkerShutdownRequest;

type SerializedWorkerError = {
  name: string;
  message: string;
  stack?: string;
};

export type RasterSamplingWorkerResponse =
  | { id: number; status: "success"; result: RasterProfileSamplingResult }
  | { id: number; status: "error"; error: SerializedWorkerError }
  | { status: "closed" }
  | { status: "close-error"; error: SerializedWorkerError };

// Narrow interface shared by Node Workers and the lightweight test double.
type WorkerLike = {
  on(event: "message", listener: (response: RasterSamplingWorkerResponse) => void): WorkerLike;
  on(event: "error", listener: (error: Error) => void): WorkerLike;
  on(event: "exit", listener: (code: number) => void): WorkerLike;
  postMessage(request: RasterSamplingWorkerMessage): void;
  terminate(): Promise<number>;
};

type Job = {
  // postMessage uses structured cloning, so requests contain only plain data.
  request: RasterSamplingWorkerRequest;
  queuedAt: number;
  resolve: (result: RasterSamplingWorkerResult) => void;
  reject: (error: Error) => void;
};

type WorkerSlot = {
  worker: WorkerLike;
  workerId: number;
  // A worker processes one job at a time. An empty job marks the worker idle.
  job?: Job;
  startedAt?: number;
  timeout?: NodeJS.Timeout;
  shutdownComplete?: (error?: Error) => void;
  // Set once the worker sends any message, which proves its entry point loaded.
  everResponded?: boolean;
};

export type RasterSamplingWorkerResult = RasterProfileSamplingResult & {
  // Timing is measured in the parent process so callers can distinguish capacity waits from
  // GeoTIFF decoding and coordinate conversion time.
  workerId: number;
  queueDurationMs: number;
  executionDurationMs: number;
};

export class RasterSamplingWorkerPoolUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RasterSamplingWorkerPoolUnavailableError";
  }
}

type RasterSamplingWorkerPoolOptions = {
  size?: number;
  maxQueueSize?: number;
  jobTimeoutMs?: number;
  workerFactory?: () => WorkerLike;
  maxStartupFailures?: number;
  respawnDelayMs?: number;
  unavailableRetryAfterMs?: number;
};

const positiveIntegerFromEnvironment = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

// RASTER_SAMPLING_WORKERS overrides this default. Reserve one logical CPU for the API and cap
// the default at four workers. With two cores, one worker keeps the API responsive while sampling.
const defaultPoolSize = Math.min(4, Math.max(1, availableParallelism() - 1));
const WORKER_SHUTDOWN_TIMEOUT_MS = 5_000;

// A worker that dies without ever sending a message never finished starting. Replacing it cannot
// succeed when the cause is permanent, such as a missing or unloadable worker entry point, and an
// immediate replacement turns that into a thread-spawn loop that saturates every core. After this
// many consecutive startup failures the pool stops replacing workers and reports itself
// unavailable instead.
const MAX_CONSECUTIVE_STARTUP_FAILURES = 5;
// Replacement of a worker that failed to start is delayed, doubling per consecutive failure, so
// even a misdiagnosed permanent fault cannot spin. Workers that crash after starting are replaced
// immediately, because that path is already bounded by the work that triggered the crash.
const RESPAWN_BASE_DELAY_MS = 100;
const RESPAWN_MAX_DELAY_MS = 5_000;
// How long the pool stays unavailable before one more round of workers is attempted. This lets a
// deploy that repairs the worker entry point recover without restarting the API, while keeping
// retries rare enough to stay cheap.
const UNAVAILABLE_RETRY_AFTER_MS = 60_000;

/**
 * Runs CPU-heavy raster profile sampling outside the API event loop.
 *
 * Workers are persistent because starting a thread for every request is expensive. Each worker
 * accepts one job at a time; excess jobs wait in a bounded FIFO queue. Messages crossing the
 * thread boundary are copied using Node's structured clone algorithm.
 *
 * A failed or timed-out worker is removed and replaced. Only its active job fails; queued jobs
 * continue on healthy workers. Call close() during server shutdown to reject outstanding work,
 * close each worker-local raster cache, and terminate every thread.
 *
 * Replacement is not unconditional. Workers that repeatedly die before ever responding indicate a
 * permanent fault that respawning cannot fix, so the pool gives up, rejects work immediately, and
 * retries only occasionally. This keeps a broken worker entry point degrading elevation sampling
 * rather than consuming every core.
 */
export class RasterSamplingWorkerPool {
  private readonly size: number;
  private readonly maxQueueSize: number;
  private readonly jobTimeoutMs: number;
  private readonly workerFactory: () => WorkerLike;
  private readonly maxStartupFailures: number;
  private readonly respawnDelayMs: number;
  private readonly unavailableRetryAfterMs: number;
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: Job[] = [];
  private nextJobId = 1;
  private nextWorkerId = 1;
  private started = false;
  private closing = false;
  private closePromise?: Promise<void>;
  // Counts workers that died before responding. Any successful start resets it to zero.
  private consecutiveStartupFailures = 0;
  // Set when startup failures exceed the limit. Cleared by the next retry attempt.
  private unavailableSince?: number;
  private unavailableReason?: string;
  private readonly respawnTimers = new Set<NodeJS.Timeout>();

  constructor(options: RasterSamplingWorkerPoolOptions = {}) {
    this.size =
      options.size ?? positiveIntegerFromEnvironment("RASTER_SAMPLING_WORKERS", defaultPoolSize);
    this.maxQueueSize =
      options.maxQueueSize ?? positiveIntegerFromEnvironment("RASTER_SAMPLING_MAX_QUEUE", 32);
    this.jobTimeoutMs =
      options.jobTimeoutMs ??
      positiveIntegerFromEnvironment("RASTER_SAMPLING_JOB_TIMEOUT_MS", 60_000);
    this.workerFactory =
      options.workerFactory ??
      // esbuild emits the worker entry point beside api.js in development and production.
      (() => new Worker(new URL("./rasterSamplingWorker.js", import.meta.url)) as WorkerLike);
    this.maxStartupFailures =
      options.maxStartupFailures ??
      positiveIntegerFromEnvironment(
        "RASTER_SAMPLING_MAX_STARTUP_FAILURES",
        MAX_CONSECUTIVE_STARTUP_FAILURES
      );
    this.respawnDelayMs = options.respawnDelayMs ?? RESPAWN_BASE_DELAY_MS;
    this.unavailableRetryAfterMs = options.unavailableRetryAfterMs ?? UNAVAILABLE_RETRY_AFTER_MS;
  }

  /** Submits a raster profile and resolves when a worker returns its result. */
  run(
    descriptor: RasterDescriptor,
    path: GeographicPoint[],
    steps: number[]
  ): Promise<RasterSamplingWorkerResult> {
    if (this.closing) {
      return Promise.reject(
        new RasterSamplingWorkerPoolUnavailableError("Raster sampling workers are closed")
      );
    }
    // Workers are known to be unable to start. Fail fast rather than queueing work that cannot
    // run, until enough time has passed to justify another attempt.
    if (this.unavailableSince !== undefined) {
      if (performance.now() - this.unavailableSince < this.unavailableRetryAfterMs) {
        return Promise.reject(
          new RasterSamplingWorkerPoolUnavailableError(
            this.unavailableReason ?? "Raster sampling workers are unavailable"
          )
        );
      }
      this.clearUnavailable();
    }
    this.start();
    // Each worker owns its own raster cache and decoder. Dispatching whole profiles avoids
    // repeatedly transferring sample arrays between threads and preserves cache locality.
    const idleWorker = this.workers.find((slot) => !slot.job);
    if (!idleWorker && this.queue.length >= this.maxQueueSize) {
      return Promise.reject(
        new RasterSamplingWorkerPoolUnavailableError("Raster sampling worker queue is full")
      );
    }

    return new Promise((resolve, reject) => {
      const job: Job = {
        request: { type: "sample", id: this.nextJobId++, descriptor, path, steps },
        queuedAt: performance.now(),
        resolve,
        reject,
      };
      if (idleWorker) this.dispatch(idleWorker, job);
      else this.queue.push(job);
    });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.closeWorkers();
    return this.closePromise;
  }

  private async closeWorkers(): Promise<void> {
    const closedError = new RasterSamplingWorkerPoolUnavailableError(
      "Raster sampling workers are closed"
    );
    this.respawnTimers.forEach((timer) => clearTimeout(timer));
    this.respawnTimers.clear();
    this.queue.splice(0).forEach((job) => job.reject(closedError));
    this.workers.forEach((slot) => {
      if (slot.timeout) clearTimeout(slot.timeout);
      slot.job?.reject(closedError);
      slot.job = undefined;
    });
    const workers = this.workers.splice(0);
    const results = await Promise.allSettled(workers.map((slot) => this.shutdownWorker(slot)));
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }

  private start(): void {
    // Start lazily so processes that never sample rasters do not create threads.
    if (this.started) return;
    this.started = true;
    for (let index = 0; index < this.size; index += 1) this.addWorker();
  }

  /** Re-arms the pool for one more round of workers after an unavailable period. */
  private clearUnavailable(): void {
    this.unavailableSince = undefined;
    this.unavailableReason = undefined;
    this.consecutiveStartupFailures = 0;
    // start() is one-shot, so it must be re-armed for the retry to create workers.
    this.started = false;
  }

  /**
   * Stops replacing workers and fails outstanding and incoming work until the retry window
   * elapses. Entering this state is logged once, because the condition is persistent and the
   * per-request 503s alone do not identify the cause.
   */
  private markUnavailable(error: Error): void {
    this.unavailableSince = performance.now();
    this.unavailableReason = `Raster sampling workers failed to start ${this.consecutiveStartupFailures} times in a row: ${error.message}`;
    this.started = false;
    serverLogger.error(
      {
        logId: "raster",
        logValue: `${this.unavailableReason}. Elevation sampling is disabled for ${Math.round(
          this.unavailableRetryAfterMs / 1000
        )}s.`,
      },
      error
    );
    const unavailableError = new RasterSamplingWorkerPoolUnavailableError(this.unavailableReason);
    this.queue.splice(0).forEach((job) => job.reject(unavailableError));
  }

  private addWorker(): void {
    if (this.closing) return;
    const worker = this.workerFactory();
    const slot: WorkerSlot = { worker, workerId: this.nextWorkerId++ };
    this.workers.push(slot);
    worker.on("message", (response: RasterSamplingWorkerResponse) =>
      this.handleResponse(slot, response)
    );
    // An uncaught worker error terminates that thread. The exit event may follow, so failure
    // handling first verifies that the slot is still registered.
    worker.on("error", (error: Error) => this.handleWorkerFailure(slot, error));
    worker.on("exit", (code: number) => {
      this.handleWorkerFailure(slot, new Error(`Raster sampling worker exited with code ${code}`));
    });
  }

  private dispatch(slot: WorkerSlot, job: Job): void {
    slot.job = job;
    slot.startedAt = performance.now();
    slot.timeout = setTimeout(() => {
      // JavaScript running inside a worker cannot be interrupted safely; terminate the thread.
      this.handleWorkerFailure(
        slot,
        new RasterSamplingWorkerPoolUnavailableError(
          `Raster sampling worker exceeded the ${this.jobTimeoutMs} ms timeout`
        )
      );
      slot.worker.terminate().catch((): undefined => undefined);
    }, this.jobTimeoutMs);
    slot.timeout.unref();
    try {
      slot.worker.postMessage(job.request);
    } catch (error) {
      this.handleWorkerFailure(slot, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleResponse(slot: WorkerSlot, response: RasterSamplingWorkerResponse): void {
    // Any message proves the entry point loaded and the thread reached its message handler, so
    // later failures on this worker are crashes rather than startup faults.
    if (!slot.everResponded) {
      slot.everResponded = true;
      this.consecutiveStartupFailures = 0;
    }
    if (response.status === "closed" || response.status === "close-error") {
      slot.shutdownComplete?.(
        response.status === "close-error" ? this.deserializeError(response.error) : undefined
      );
      return;
    }

    const job = slot.job;
    if (this.closing && !job) return;
    if (!job || response.id !== job.request.id) {
      // IDs prevent a stale or malformed message from resolving the wrong caller's promise.
      this.handleWorkerFailure(
        slot,
        new Error("Raster sampling worker returned an unexpected response")
      );
      slot.worker.terminate().catch((): undefined => undefined);
      return;
    }
    if (slot.timeout) clearTimeout(slot.timeout);
    const completedAt = performance.now();
    if (response.status === "success") {
      job.resolve({
        ...response.result,
        workerId: slot.workerId,
        queueDurationMs: (slot.startedAt ?? completedAt) - job.queuedAt,
        executionDurationMs: completedAt - (slot.startedAt ?? completedAt),
      });
    } else {
      job.reject(this.deserializeError(response.error));
    }
    slot.job = undefined;
    slot.startedAt = undefined;
    slot.timeout = undefined;
    this.dispatchNext(slot);
  }

  private handleWorkerFailure(slot: WorkerSlot, error: Error): void {
    // Both "error" and "exit" can report one failure. Removing the slot makes this idempotent.
    const index = this.workers.indexOf(slot);
    if (index !== -1) this.workers.splice(index, 1);
    else if (!this.closing) return;
    if (slot.timeout) clearTimeout(slot.timeout);
    const hadJob = slot.job !== undefined;
    slot.job?.reject(
      error instanceof RasterSamplingWorkerPoolUnavailableError
        ? error
        : new RasterSamplingWorkerPoolUnavailableError(error.message)
    );
    if (!this.closing) {
      // A worker that died while idle, having never sent a message, failed to start: no job of
      // ours can explain its death. Node reports an unresolvable entry point asynchronously on
      // "error", which is otherwise indistinguishable from a crash. A worker holding a job is
      // attributed to that job instead, since bad raster input must not disable the pool.
      const failedToStart = !slot.everResponded && !hadJob;
      if (failedToStart) {
        this.consecutiveStartupFailures += 1;
        if (this.consecutiveStartupFailures >= this.maxStartupFailures) {
          this.markUnavailable(error);
        } else {
          this.scheduleRespawn();
        }
      } else {
        // Only a worker that actually responded proves the entry point is loadable. A worker that
        // died holding its first job is replaced immediately, but must not clear the count, or a
        // steady trickle of requests would keep resetting it and the loop would never be caught.
        if (slot.everResponded) this.consecutiveStartupFailures = 0;
        this.addWorker();
        this.dispatchQueuedJobs();
      }
    }
    slot.shutdownComplete?.(error);
  }

  /** Replaces a worker that failed to start, after a delay that doubles per consecutive failure. */
  private scheduleRespawn(): void {
    const delay = Math.min(
      this.respawnDelayMs * 2 ** (this.consecutiveStartupFailures - 1),
      RESPAWN_MAX_DELAY_MS
    );
    const timer = setTimeout(() => {
      this.respawnTimers.delete(timer);
      if (this.closing || this.unavailableSince !== undefined) return;
      this.addWorker();
      this.dispatchQueuedJobs();
    }, delay);
    // Never hold the process open purely to retry a worker that is failing to start.
    timer.unref();
    this.respawnTimers.add(timer);
  }

  private async shutdownWorker(slot: WorkerSlot): Promise<void> {
    let cleanupError: Error | undefined;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        cleanupError = new Error(
          `Raster sampling worker ${slot.workerId} did not close within ${WORKER_SHUTDOWN_TIMEOUT_MS} ms`
        );
        slot.shutdownComplete = undefined;
        resolve();
      }, WORKER_SHUTDOWN_TIMEOUT_MS);
      slot.shutdownComplete = (error) => {
        cleanupError = error;
        clearTimeout(timeout);
        slot.shutdownComplete = undefined;
        resolve();
      };
      try {
        slot.worker.postMessage({ type: "shutdown" });
      } catch (error) {
        cleanupError = error instanceof Error ? error : new Error(String(error));
        clearTimeout(timeout);
        slot.shutdownComplete = undefined;
        resolve();
      }
    });

    await slot.worker.terminate();
    if (cleanupError) throw cleanupError;
  }

  private dispatchNext(slot: WorkerSlot): void {
    const nextJob = this.queue.shift();
    if (nextJob) this.dispatch(slot, nextJob);
  }

  private dispatchQueuedJobs(): void {
    this.workers
      .filter((slot) => !slot.job)
      .forEach((slot) => {
        if (this.queue.length > 0) this.dispatchNext(slot);
      });
  }

  private deserializeError(error: SerializedWorkerError): Error {
    const result = new Error(error.message);
    result.name = error.name;
    result.stack = error.stack;
    return result;
  }
}

const rasterSamplingWorkerPool = new RasterSamplingWorkerPool();

export const sampleRasterProfileInWorker = (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<RasterSamplingWorkerResult> => rasterSamplingWorkerPool.run(descriptor, path, steps);

export const closeRasterSamplingWorkerPool = (): Promise<void> => rasterSamplingWorkerPool.close();

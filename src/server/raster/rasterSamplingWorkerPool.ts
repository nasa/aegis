import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

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
};

const positiveIntegerFromEnvironment = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

// RASTER_SAMPLING_WORKERS overrides this default. Reserve one logical CPU for the API and cap
// the default at four workers. With two cores, one worker keeps the API responsive while sampling.
const defaultPoolSize = Math.min(4, Math.max(1, availableParallelism() - 1));
const WORKER_SHUTDOWN_TIMEOUT_MS = 5_000;

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
 */
export class RasterSamplingWorkerPool {
  private readonly size: number;
  private readonly maxQueueSize: number;
  private readonly jobTimeoutMs: number;
  private readonly workerFactory: () => WorkerLike;
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: Job[] = [];
  private nextJobId = 1;
  private nextWorkerId = 1;
  private started = false;
  private closing = false;
  private closePromise?: Promise<void>;

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
    slot.job?.reject(
      error instanceof RasterSamplingWorkerPoolUnavailableError
        ? error
        : new RasterSamplingWorkerPoolUnavailableError(error.message)
    );
    if (!this.closing) {
      this.addWorker();
      this.dispatchQueuedJobs();
    }
    slot.shutdownComplete?.(error);
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

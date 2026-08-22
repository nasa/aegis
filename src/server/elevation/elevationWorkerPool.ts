import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import type { ElevationProfileResult } from "./readElevationProfile";
import type { GeographicPoint, RasterDescriptor } from "server/raster/types";

export type ElevationWorkerRequest = {
  id: number;
  descriptor: RasterDescriptor;
  path: GeographicPoint[];
  steps: number[];
};

type SerializedWorkerError = {
  name: string;
  message: string;
  stack?: string;
};

export type ElevationWorkerResponse =
  | { id: number; status: "success"; result: ElevationProfileResult }
  | { id: number; status: "error"; error: SerializedWorkerError };

// Narrow interface shared by Node Workers and the lightweight test double.
type WorkerLike = {
  on(event: "message", listener: (response: ElevationWorkerResponse) => void): WorkerLike;
  on(event: "error", listener: (error: Error) => void): WorkerLike;
  on(event: "exit", listener: (code: number) => void): WorkerLike;
  postMessage(request: ElevationWorkerRequest): void;
  terminate(): Promise<number>;
};

type Job = {
  // postMessage uses structured cloning, so requests contain only plain data.
  request: ElevationWorkerRequest;
  queuedAt: number;
  resolve: (result: ElevationWorkerResult) => void;
  reject: (error: Error) => void;
};

type WorkerSlot = {
  worker: WorkerLike;
  workerId: number;
  // A worker processes one job at a time. An empty job marks the worker idle.
  job?: Job;
  startedAt?: number;
  timeout?: NodeJS.Timeout;
};

export type ElevationWorkerResult = ElevationProfileResult & {
  workerId: number;
  queueDurationMs: number;
  executionDurationMs: number;
};

export class ElevationWorkerPoolUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElevationWorkerPoolUnavailableError";
  }
}

type ElevationWorkerPoolOptions = {
  size?: number;
  maxQueueSize?: number;
  jobTimeoutMs?: number;
  workerFactory?: () => WorkerLike;
};

const positiveIntegerFromEnvironment = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

// ELEVATION_WORKERS overrides this default. Reserve one logical CPU for the API and cap the
// default at four workers in case we ever get more CPUs for AEGIS prod. With our current 2 cores,
// this algorithm gives us 1 worker, which is enough to keep the API responsive while reading elevation.
const defaultPoolSize = Math.min(4, Math.max(1, availableParallelism() - 1));

/**
 * Runs CPU-heavy elevation profiles outside the API event loop.
 *
 * Workers are persistent because starting a thread for every request is expensive. Each worker
 * accepts one job at a time; excess jobs wait in a bounded FIFO queue. Messages crossing the
 * thread boundary are copied using Node's structured clone algorithm.
 *
 * A failed or timed-out worker is removed and replaced. Only its active job fails; queued jobs
 * continue on healthy workers. Call close() during server shutdown to reject outstanding work
 * and terminate every thread.
 */
export class ElevationWorkerPool {
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

  constructor(options: ElevationWorkerPoolOptions = {}) {
    this.size =
      options.size ?? positiveIntegerFromEnvironment("ELEVATION_WORKERS", defaultPoolSize);
    this.maxQueueSize =
      options.maxQueueSize ?? positiveIntegerFromEnvironment("ELEVATION_MAX_QUEUE", 32);
    this.jobTimeoutMs =
      options.jobTimeoutMs ?? positiveIntegerFromEnvironment("ELEVATION_JOB_TIMEOUT_MS", 60_000);
    this.workerFactory =
      options.workerFactory ??
      // esbuild emits the worker entry point beside api.js in development and production.
      (() => new Worker(new URL("./elevationWorker.js", import.meta.url)) as WorkerLike);
  }

  /** Submits a profile and resolves when a worker returns its result. */
  run(
    descriptor: RasterDescriptor,
    path: GeographicPoint[],
    steps: number[]
  ): Promise<ElevationWorkerResult> {
    if (this.closing) {
      return Promise.reject(
        new ElevationWorkerPoolUnavailableError("Elevation workers are closed")
      );
    }
    this.start();
    const idleWorker = this.workers.find((slot) => !slot.job);
    if (!idleWorker && this.queue.length >= this.maxQueueSize) {
      return Promise.reject(
        new ElevationWorkerPoolUnavailableError("Elevation worker queue is full")
      );
    }

    return new Promise((resolve, reject) => {
      const job: Job = {
        request: { id: this.nextJobId++, descriptor, path, steps },
        queuedAt: performance.now(),
        resolve,
        reject,
      };
      if (idleWorker) this.dispatch(idleWorker, job);
      else this.queue.push(job);
    });
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const closedError = new ElevationWorkerPoolUnavailableError("Elevation workers are closed");
    this.queue.splice(0).forEach((job) => job.reject(closedError));
    this.workers.forEach((slot) => {
      if (slot.timeout) clearTimeout(slot.timeout);
      slot.job?.reject(closedError);
      slot.job = undefined;
    });
    const workers = this.workers.splice(0);
    await Promise.allSettled(workers.map(({ worker }) => worker.terminate()));
  }

  private start(): void {
    // Start lazily so processes that never sample elevation do not create threads.
    if (this.started) return;
    this.started = true;
    for (let index = 0; index < this.size; index += 1) this.addWorker();
  }

  private addWorker(): void {
    if (this.closing) return;
    const worker = this.workerFactory();
    const slot: WorkerSlot = { worker, workerId: this.nextWorkerId++ };
    this.workers.push(slot);
    worker.on("message", (response: ElevationWorkerResponse) =>
      this.handleResponse(slot, response)
    );
    // An uncaught worker error terminates that thread. The exit event may follow, so failure
    // handling first verifies that the slot is still registered.
    worker.on("error", (error: Error) => this.handleWorkerFailure(slot, error));
    worker.on("exit", (code: number) => {
      if (code !== 0) {
        this.handleWorkerFailure(slot, new Error(`Elevation worker exited with code ${code}`));
      }
    });
  }

  private dispatch(slot: WorkerSlot, job: Job): void {
    slot.job = job;
    slot.startedAt = performance.now();
    slot.timeout = setTimeout(() => {
      // JavaScript running inside a worker cannot be interrupted safely; terminate the thread.
      this.handleWorkerFailure(
        slot,
        new ElevationWorkerPoolUnavailableError(
          `Elevation worker exceeded the ${this.jobTimeoutMs} ms timeout`
        )
      );
      slot.worker.terminate().catch((): undefined => undefined);
    }, this.jobTimeoutMs);
    slot.timeout.unref();
    slot.worker.postMessage(job.request);
  }

  private handleResponse(slot: WorkerSlot, response: ElevationWorkerResponse): void {
    const job = slot.job;
    if (!job || response.id !== job.request.id) {
      // IDs prevent a stale or malformed message from resolving the wrong caller's promise.
      this.handleWorkerFailure(slot, new Error("Elevation worker returned an unexpected response"));
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
    if (index === -1) return;
    this.workers.splice(index, 1);
    if (slot.timeout) clearTimeout(slot.timeout);
    slot.job?.reject(
      error instanceof ElevationWorkerPoolUnavailableError
        ? error
        : new ElevationWorkerPoolUnavailableError(error.message)
    );
    if (!this.closing) {
      this.addWorker();
      this.dispatchQueuedJobs();
    }
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

const elevationWorkerPool = new ElevationWorkerPool();

export const readElevationProfileInWorker = (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<ElevationWorkerResult> => elevationWorkerPool.run(descriptor, path, steps);

export const closeElevationWorkerPool = (): Promise<void> => elevationWorkerPool.close();

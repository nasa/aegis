import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import {
  DEFAULT_RASTER_SAMPLING_JOB_TIMEOUT_MS,
  DEFAULT_RASTER_SAMPLING_MAX_ADMITTED_SAMPLES,
  DEFAULT_RASTER_SAMPLING_MAX_QUEUE,
  DEFAULT_RASTER_SAMPLING_QUEUE_DEADLINE_MS,
  DEFAULT_RASTER_SAMPLING_WORKERS,
  validateRasterProfileRequest,
} from "./constants";
import {
  RasterSamplingCancelledError,
  RasterSamplingError,
  RasterSamplingSupersededError,
  RasterSamplingWorkerPoolUnavailableError,
  type RasterSamplingErrorCode,
} from "./rasterSamplingErrors";
import type { RasterProfileSamplingResult } from "./sampleRasterProfile";
import type { GeographicPoint, RasterDescriptor } from "./types";

export { RasterSamplingWorkerPoolUnavailableError } from "./rasterSamplingErrors";

export type RasterSamplingWorkerRequest = {
  id: number;
  descriptor: RasterDescriptor;
  path: GeographicPoint[];
  steps: number[];
};

type SerializedWorkerError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
};

export type RasterSamplingWorkerResponse =
  | { id: number; status: "success"; result: RasterProfileSamplingResult }
  | { id: number; status: "error"; error: SerializedWorkerError };

// Narrow interface shared by Node Workers and the lightweight test double.
type WorkerLike = {
  on(event: "message", listener: (response: RasterSamplingWorkerResponse) => void): WorkerLike;
  on(event: "error", listener: (error: Error) => void): WorkerLike;
  on(event: "exit", listener: (code: number) => void): WorkerLike;
  postMessage(request: RasterSamplingWorkerRequest): void;
  terminate(): Promise<number>;
};

export type RasterSamplingSupersession = {
  streamKey: string;
  generation: number;
};

export type RasterSamplingRunOptions = {
  signal?: AbortSignal;
  supersession?: RasterSamplingSupersession;
  queueDeadlineMs?: number;
};

type Job = {
  // postMessage uses structured cloning, so requests contain only plain data.
  request: RasterSamplingWorkerRequest;
  cost: number;
  queuedAt: number;
  queueDeadlineAt: number;
  supersession?: RasterSamplingSupersession;
  signal?: AbortSignal;
  abortListener?: () => void;
  queueTimer?: NodeJS.Timeout;
  settled: boolean;
  active: boolean;
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
};

export type RasterSamplingWorkerResult = RasterProfileSamplingResult & {
  workerId: number;
  queueDurationMs: number;
  executionDurationMs: number;
};

export type RasterSamplingWorkerPoolSnapshot = {
  workerCount: number;
  activeWorkers: number;
  queueDepth: number;
  activeWeight: number;
  queuedWeight: number;
  admittedWeight: number;
  maxQueueSize: number;
  maxAdmittedWeight: number;
  supersededQueuedJobs: number;
  cancelledQueuedJobs: number;
  queueDeadlineCount: number;
  executionTimeoutCount: number;
  workerRestartCount: number;
};

export type RasterSamplingWorkerPoolOptions = {
  size?: number;
  maxQueueSize?: number;
  maxAdmittedWeight?: number;
  queueDeadlineMs?: number;
  jobTimeoutMs?: number;
  workerFactory?: () => WorkerLike;
};

/**
 * Runs CPU-heavy raster profile sampling outside the API event loop.
 *
 * Workers are persistent because starting a thread for every request is expensive. Each worker
 * accepts one job at a time; excess jobs wait in a bounded FIFO queue. Messages crossing the
 * thread boundary are copied using Node's structured clone algorithm.
 *
 * A failed or timed-out worker is removed and replaced. Only its active job fails; queued jobs
 * continue on healthy workers. Call close() during server shutdown to reject outstanding work
 * and terminate every thread.
 */
export class RasterSamplingWorkerPool {
  private readonly size: number;
  private readonly maxQueueSize: number;
  private readonly maxAdmittedWeight: number;
  private readonly queueDeadlineMs: number;
  private readonly jobTimeoutMs: number;
  private readonly workerFactory: () => WorkerLike;
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: Job[] = [];
  private nextJobId = 1;
  private nextWorkerId = 1;
  private started = false;
  private closing = false;
  private admittedWeight = 0;
  private supersededQueuedJobs = 0;
  private cancelledQueuedJobs = 0;
  private queueDeadlineCount = 0;
  private executionTimeoutCount = 0;
  private workerRestartCount = 0;

  constructor(options: RasterSamplingWorkerPoolOptions = {}) {
    this.size = options.size ?? DEFAULT_RASTER_SAMPLING_WORKERS;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_RASTER_SAMPLING_MAX_QUEUE;
    this.maxAdmittedWeight =
      options.maxAdmittedWeight ?? DEFAULT_RASTER_SAMPLING_MAX_ADMITTED_SAMPLES;
    this.queueDeadlineMs = options.queueDeadlineMs ?? DEFAULT_RASTER_SAMPLING_QUEUE_DEADLINE_MS;
    this.jobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_RASTER_SAMPLING_JOB_TIMEOUT_MS;
    this.workerFactory =
      options.workerFactory ??
      // esbuild emits the worker entry point beside api.js in development and production.
      (() => new Worker(new URL("./rasterSamplingWorker.js", import.meta.url)) as WorkerLike);
  }

  /** Submits a raster profile and resolves when a worker returns its result. */
  run(
    descriptor: RasterDescriptor,
    path: GeographicPoint[],
    steps: number[],
    options: RasterSamplingRunOptions = {}
  ): Promise<RasterSamplingWorkerResult> {
    if (this.closing) {
      return Promise.reject(
        new RasterSamplingWorkerPoolUnavailableError(
          "Raster sampling workers are closed",
          "RASTER_SAMPLING_CLOSED"
        )
      );
    }
    if (options.signal?.aborted) return Promise.reject(new RasterSamplingCancelledError());

    const cost = validateRasterProfileRequest(path.length, steps);
    this.validateSupersession(options.supersession);
    this.start();
    const superseded = options.supersession
      ? this.removeSupersededQueuedJobs(options.supersession)
      : 0;
    this.supersededQueuedJobs += superseded;

    const idleWorker = this.workers.find((slot) => !slot.job);
    if (!idleWorker && this.queue.length >= this.maxQueueSize) {
      return Promise.reject(this.busyError("Raster sampling worker queue is full"));
    }
    if (this.admittedWeight + cost > this.maxAdmittedWeight) {
      return Promise.reject(this.busyError("Raster sampling capacity is full"));
    }

    return new Promise((resolve, reject) => {
      const queuedAt = performance.now();
      const queueDeadlineMs = options.queueDeadlineMs ?? this.queueDeadlineMs;
      const job: Job = {
        request: { id: this.nextJobId++, descriptor, path, steps },
        cost,
        queuedAt,
        queueDeadlineAt: queuedAt + queueDeadlineMs,
        supersession: options.supersession,
        signal: options.signal,
        settled: false,
        active: false,
        resolve,
        reject,
      };
      this.admittedWeight += cost;
      if (options.signal) {
        job.abortListener = () => this.cancelJob(job);
        options.signal.addEventListener("abort", job.abortListener, { once: true });
      }
      if (idleWorker) this.dispatch(idleWorker, job);
      else {
        this.queue.push(job);
        job.queueTimer = setTimeout(() => this.expireQueuedJob(job), queueDeadlineMs);
        job.queueTimer.unref();
      }
    });
  }

  snapshot(): RasterSamplingWorkerPoolSnapshot {
    const activeJobs = this.workers.flatMap((slot) => (slot.job ? [slot.job] : []));
    return {
      workerCount: this.workers.length,
      activeWorkers: activeJobs.length,
      queueDepth: this.queue.length,
      activeWeight: activeJobs.reduce((total, job) => total + job.cost, 0),
      queuedWeight: this.queue.reduce((total, job) => total + job.cost, 0),
      admittedWeight: this.admittedWeight,
      maxQueueSize: this.maxQueueSize,
      maxAdmittedWeight: this.maxAdmittedWeight,
      supersededQueuedJobs: this.supersededQueuedJobs,
      cancelledQueuedJobs: this.cancelledQueuedJobs,
      queueDeadlineCount: this.queueDeadlineCount,
      executionTimeoutCount: this.executionTimeoutCount,
      workerRestartCount: this.workerRestartCount,
    };
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const error = new RasterSamplingWorkerPoolUnavailableError(
      "Raster sampling workers are closed",
      "RASTER_SAMPLING_CLOSED"
    );
    this.queue.splice(0).forEach((job) => this.finishJob(job, error));
    this.workers.forEach((slot) => {
      if (slot.timeout) clearTimeout(slot.timeout);
      if (slot.job) this.finishJob(slot.job, error);
      slot.job = undefined;
    });
    const workers = this.workers.splice(0);
    await Promise.allSettled(workers.map(({ worker }) => worker.terminate()));
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
    worker.on("message", (response) => this.handleResponse(slot, response));
    // An uncaught worker error terminates that thread. The exit event may follow, so failure
    // handling first verifies that the slot is still registered.
    worker.on("error", (error) => this.handleWorkerFailure(slot, error));
    worker.on("exit", (code) => {
      if (code !== 0) {
        this.handleWorkerFailure(
          slot,
          new RasterSamplingWorkerPoolUnavailableError(
            `Raster sampling worker exited with code ${code}`,
            "RASTER_SAMPLING_WORKER_FAILED"
          )
        );
      }
    });
  }

  private dispatch(slot: WorkerSlot, job: Job): void {
    if (performance.now() >= job.queueDeadlineAt) {
      this.queueDeadlineCount += 1;
      this.finishJob(
        job,
        new RasterSamplingWorkerPoolUnavailableError(
          "Raster sampling queue deadline exceeded",
          "RASTER_SAMPLING_QUEUE_DEADLINE",
          250
        )
      );
      this.dispatchNext(slot);
      return;
    }
    if (job.queueTimer) clearTimeout(job.queueTimer);
    job.queueTimer = undefined;
    job.active = true;
    slot.job = job;
    slot.startedAt = performance.now();
    slot.timeout = setTimeout(() => {
      // JavaScript running inside a worker cannot be interrupted safely; terminate the thread.
      this.executionTimeoutCount += 1;
      this.handleWorkerFailure(
        slot,
        new RasterSamplingWorkerPoolUnavailableError(
          `Raster sampling worker exceeded the ${this.jobTimeoutMs} ms timeout`,
          "RASTER_SAMPLING_TIMEOUT"
        )
      );
      slot.worker.terminate().catch((): undefined => undefined);
    }, this.jobTimeoutMs);
    slot.timeout.unref();
    try {
      slot.worker.postMessage(job.request);
    } catch (error) {
      this.handleWorkerFailure(
        slot,
        new RasterSamplingWorkerPoolUnavailableError(
          error instanceof Error ? error.message : "Unable to dispatch raster sampling job",
          "RASTER_SAMPLING_WORKER_FAILED"
        )
      );
    }
  }

  private handleResponse(slot: WorkerSlot, response: RasterSamplingWorkerResponse): void {
    const job = slot.job;
    if (!job || response.id !== job.request.id) {
      // IDs prevent a stale or malformed message from resolving the wrong caller's promise.
      this.handleWorkerFailure(
        slot,
        new RasterSamplingWorkerPoolUnavailableError(
          "Raster sampling worker returned an unexpected response",
          "RASTER_SAMPLING_WORKER_FAILED"
        )
      );
      slot.worker.terminate().catch((): undefined => undefined);
      return;
    }
    if (slot.timeout) clearTimeout(slot.timeout);
    const completedAt = performance.now();
    const result =
      response.status === "success"
        ? {
            ...response.result,
            workerId: slot.workerId,
            queueDurationMs: (slot.startedAt ?? completedAt) - job.queuedAt,
            executionDurationMs: completedAt - (slot.startedAt ?? completedAt),
          }
        : undefined;
    this.finishJob(
      job,
      response.status === "error" ? this.deserializeError(response.error) : null,
      result
    );
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
    if (slot.job) {
      this.finishJob(
        slot.job,
        error instanceof RasterSamplingError
          ? error
          : new RasterSamplingWorkerPoolUnavailableError(
              error.message,
              "RASTER_SAMPLING_WORKER_FAILED"
            )
      );
    }
    if (!this.closing) {
      this.workerRestartCount += 1;
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

  private removeSupersededQueuedJobs(supersession: RasterSamplingSupersession): number {
    let removed = 0;
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const queued = this.queue[index];
      if (
        queued.supersession?.streamKey === supersession.streamKey &&
        queued.supersession.generation < supersession.generation
      ) {
        this.queue.splice(index, 1);
        this.finishJob(queued, new RasterSamplingSupersededError());
        removed += 1;
      }
    }
    return removed;
  }

  private cancelJob(job: Job): void {
    if (job.active) {
      // Active work is allowed to finish so ordinary disconnects do not churn workers.
      return;
    }
    const index = this.queue.indexOf(job);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.cancelledQueuedJobs += 1;
    this.finishJob(job, new RasterSamplingCancelledError());
  }

  private expireQueuedJob(job: Job): void {
    const index = this.queue.indexOf(job);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.queueDeadlineCount += 1;
    this.finishJob(
      job,
      new RasterSamplingWorkerPoolUnavailableError(
        "Raster sampling queue deadline exceeded",
        "RASTER_SAMPLING_QUEUE_DEADLINE",
        250
      )
    );
  }

  private finishJob(job: Job, error: Error | null, result?: RasterSamplingWorkerResult): void {
    if (job.queueTimer) clearTimeout(job.queueTimer);
    if (job.signal && job.abortListener) {
      job.signal.removeEventListener("abort", job.abortListener);
    }
    if (job.active || this.queue.indexOf(job) === -1) {
      this.admittedWeight = Math.max(0, this.admittedWeight - job.cost);
    }
    job.active = false;
    if (job.settled) return;
    job.settled = true;
    if (error) job.reject(error);
    else if (result) job.resolve(result);
  }

  private validateSupersession(supersession?: RasterSamplingSupersession): void {
    if (!supersession) return;
    if (
      supersession.streamKey.length < 1 ||
      supersession.streamKey.length > 256 ||
      !/^[A-Za-z0-9:_-]+$/.test(supersession.streamKey) ||
      !Number.isSafeInteger(supersession.generation) ||
      supersession.generation < 0
    ) {
      throw new TypeError("Invalid raster sampling supersession metadata");
    }
  }

  private busyError(message: string): RasterSamplingWorkerPoolUnavailableError {
    return new RasterSamplingWorkerPoolUnavailableError(message, "RASTER_SAMPLING_BUSY", 250);
  }

  private deserializeError(error: SerializedWorkerError): Error {
    const result = error.code
      ? new RasterSamplingError(error.code as RasterSamplingErrorCode, error.message)
      : new Error(error.message);
    result.name = error.name;
    result.stack = error.stack;
    return result;
  }
}

const rasterSamplingWorkerPool = new RasterSamplingWorkerPool();

export const sampleRasterProfileInWorker = (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[],
  options?: RasterSamplingRunOptions
): Promise<RasterSamplingWorkerResult> =>
  rasterSamplingWorkerPool.run(descriptor, path, steps, options);

export const getRasterSamplingWorkerPoolSnapshot = (): RasterSamplingWorkerPoolSnapshot =>
  rasterSamplingWorkerPool.snapshot();

export const closeRasterSamplingWorkerPool = (): Promise<void> => rasterSamplingWorkerPool.close();

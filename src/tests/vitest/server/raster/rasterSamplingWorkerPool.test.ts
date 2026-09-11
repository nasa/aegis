import { EventEmitter } from "node:events";

import {
  RasterSamplingWorkerPool,
  RasterSamplingWorkerPoolUnavailableError,
} from "server/raster/rasterSamplingWorkerPool";
import type {
  RasterSamplingWorkerMessage,
  RasterSamplingWorkerRequest,
  RasterSamplingWorkerResponse,
} from "server/raster/rasterSamplingWorkerPool";

const metadata: RasterMetadata = {
  width: 2,
  height: 2,
  origin: [0, 0],
  resolution: [1, -1],
  blockSize: [2, 2],
  isTiled: false,
  samplesPerPixel: 1,
  noData: null,
  geoKeys: {},
};

class FakeWorker extends EventEmitter {
  readonly requests: RasterSamplingWorkerRequest[] = [];
  readonly terminate = vi.fn(async () => 0);
  shutdownRequests = 0;

  constructor(private readonly acknowledgeShutdown = true) {
    super();
  }

  postMessage(request: RasterSamplingWorkerMessage): void {
    if (request.type === "shutdown") {
      this.shutdownRequests += 1;
      if (this.acknowledgeShutdown) queueMicrotask(() => this.closeSuccessfully());
      return;
    }
    this.requests.push(request);
  }

  override on(event: string, listener: (...args: never[]) => void): this {
    return super.on(event, listener);
  }

  succeed(requestIndex = 0): void {
    const request = this.requests[requestIndex];
    const response: RasterSamplingWorkerResponse = {
      id: request.id,
      status: "success",
      result: {
        samples: [
          [
            { status: "value", value: 10 },
            { status: "value", value: 11 },
          ],
        ],
        metadata,
        samplesRead: 2,
        blocksRead: 1,
      },
    };
    this.emit("message", response);
  }

  closeSuccessfully(): void {
    this.emit("message", { status: "closed" });
  }
}

const descriptor = { absolutePath: "fixture.tif" };
const path = [
  { lat: 0, lng: 0 },
  { lat: 1, lng: 1 },
];

describe("RasterSamplingWorkerPool", () => {
  it("reuses a persistent worker and runs queued jobs in order", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      maxQueueSize: 2,
      workerFactory: () => worker,
    });

    const first = pool.run(descriptor, path, [2]);
    const second = pool.run(descriptor, path, [2]);
    expect(worker.requests).toHaveLength(1);

    worker.succeed();
    await expect(first).resolves.toMatchObject({
      samples: [
        [
          { status: "value", value: 10 },
          { status: "value", value: 11 },
        ],
      ],
      workerId: 1,
      samplesRead: 2,
    });
    expect(worker.requests).toHaveLength(2);

    worker.succeed(1);
    await expect(second).resolves.toMatchObject({ workerId: 1 });
    await pool.close();
    expect(worker.shutdownRequests).toBe(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("waits for worker cache cleanup before terminating", async () => {
    const worker = new FakeWorker(false);
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });
    const active = pool.run(descriptor, path, [2]);
    worker.succeed();
    await active;

    const closing = pool.close();
    expect(worker.shutdownRequests).toBe(1);
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.closeSuccessfully();
    await closing;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("shares one cleanup operation across concurrent close calls", async () => {
    const worker = new FakeWorker(false);
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });
    const active = pool.run(descriptor, path, [2]);
    worker.succeed();
    await active;

    const firstClose = pool.close();
    const secondClose = pool.close();
    expect(secondClose).toBe(firstClose);
    expect(worker.shutdownRequests).toBe(1);

    worker.closeSuccessfully();
    await Promise.all([firstClose, secondClose]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects work when the bounded queue is full", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      maxQueueSize: 1,
      workerFactory: () => worker,
    });

    const active = pool.run(descriptor, path, [2]);
    const queued = pool.run(descriptor, path, [2]);
    await expect(pool.run(descriptor, path, [2])).rejects.toBeInstanceOf(
      RasterSamplingWorkerPoolUnavailableError
    );

    worker.succeed();
    await active;
    worker.succeed(1);
    await queued;
    await pool.close();
  });

  it("rejects the active job and replaces a failed worker", async () => {
    const firstWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const workers = [firstWorker, replacementWorker];
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      workerFactory: () => workers.shift()!,
    });

    const failed = pool.run(descriptor, path, [2]);
    const queued = pool.run(descriptor, path, [2]);
    firstWorker.emit("error", new Error("decoder crashed"));

    await expect(failed).rejects.toBeInstanceOf(RasterSamplingWorkerPoolUnavailableError);
    expect(replacementWorker.requests).toHaveLength(1);
    replacementWorker.succeed();
    await expect(queued).resolves.toMatchObject({ workerId: 2 });
    await pool.close();
  });

  it("replaces a worker that exits cleanly but unexpectedly", async () => {
    const firstWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const workers = [firstWorker, replacementWorker];
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      workerFactory: () => workers.shift()!,
    });

    const failed = pool.run(descriptor, path, [2]);
    firstWorker.emit("exit", 0);

    await expect(failed).rejects.toBeInstanceOf(RasterSamplingWorkerPoolUnavailableError);
    const replacementJob = pool.run(descriptor, path, [2]);
    replacementWorker.succeed();
    await expect(replacementJob).resolves.toMatchObject({ workerId: 2 });
    await pool.close();
  });

  describe("when workers cannot start", () => {
    // A worker whose entry point is missing dies without ever posting a message. Node surfaces
    // that asynchronously as "error", so it looks identical to a crash apart from the silence.
    const failToStart = (worker: FakeWorker) =>
      worker.emit(
        "error",
        Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" })
      );

    const makeFailingPool = (overrides = {}) => {
      const created: FakeWorker[] = [];
      const pool = new RasterSamplingWorkerPool({
        size: 1,
        maxStartupFailures: 3,
        respawnDelayMs: 1,
        unavailableRetryAfterMs: 10_000,
        workerFactory: () => {
          const worker = new FakeWorker();
          created.push(worker);
          // Fail on the next tick so the factory returns before the error arrives, matching Node.
          queueMicrotask(() => failToStart(worker));
          return worker;
        },
        ...overrides,
      });
      return { pool, created };
    };

    const flush = async (iterations = 40) => {
      for (let index = 0; index < iterations; index += 1)
        await new Promise((r) => setTimeout(r, 2));
    };

    // The first run() creates the pool's workers, which then die while idle. That job is rejected
    // by the worker it was dispatched to; the interesting behavior is what happens afterwards.
    const primeAndSettle = async (pool: RasterSamplingWorkerPool) => {
      await expect(pool.run(descriptor, path, [2])).rejects.toBeInstanceOf(
        RasterSamplingWorkerPoolUnavailableError
      );
      await flush();
    };

    it("stops respawning after repeated startup failures instead of looping", async () => {
      const { pool, created } = makeFailingPool();
      await primeAndSettle(pool);

      // Bounded by maxStartupFailures rather than growing without limit. Without this guard the
      // same scenario spawns threads continuously for as long as the process runs.
      expect(created.length).toBeLessThanOrEqual(4);
      const settled = created.length;
      await flush();
      expect(created.length).toBe(settled);
      await pool.close();
    });

    it("fails fast without creating workers while unavailable", async () => {
      const { pool, created } = makeFailingPool();
      await primeAndSettle(pool);
      const afterGivingUp = created.length;

      await expect(pool.run(descriptor, path, [2])).rejects.toThrow(/failed to start/);
      expect(created.length).toBe(afterGivingUp);
      await pool.close();
    });

    it("retries once the unavailable window has elapsed", async () => {
      const { pool, created } = makeFailingPool({ unavailableRetryAfterMs: 0 });
      await primeAndSettle(pool);
      const afterGivingUp = created.length;

      await expect(pool.run(descriptor, path, [2])).rejects.toBeInstanceOf(
        RasterSamplingWorkerPoolUnavailableError
      );
      expect(created.length).toBeGreaterThan(afterGivingUp);
      await pool.close();
    });

    it("does not spawn threads unboundedly when the entry point is permanently missing", async () => {
      // Regression guard for the thread-spawn loop: an unresolvable worker entry point used to
      // respawn immediately on every failure, saturating every core for the life of the process.
      const { pool, created } = makeFailingPool({
        size: 3,
        maxStartupFailures: 5,
        unavailableRetryAfterMs: 10_000,
      });
      await primeAndSettle(pool);
      await flush(100);

      // Three initial workers plus a bounded number of replacements, not hundreds.
      expect(created.length).toBeLessThan(12);
      await pool.close();
    });

    it("keeps replacing a worker that crashes after it has responded", async () => {
      const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
      const created: FakeWorker[] = [];
      const pool = new RasterSamplingWorkerPool({
        size: 1,
        maxStartupFailures: 3,
        workerFactory: () => {
          const worker = workers.shift()!;
          created.push(worker);
          return worker;
        },
      });

      // Each worker completes a job (proving startup) and only then crashes.
      for (let index = 0; index < 2; index += 1) {
        const job = pool.run(descriptor, path, [2]);
        created[index].succeed();
        await job;
        created[index].emit("error", new Error("decoder crashed"));
      }

      // Startup never failed, so the pool must not have given up.
      const job = pool.run(descriptor, path, [2]);
      created[2].succeed();
      await expect(job).resolves.toMatchObject({ workerId: 3 });
      await pool.close();
    });
  });
});

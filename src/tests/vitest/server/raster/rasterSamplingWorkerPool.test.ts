import { EventEmitter } from "node:events";

import {
  RasterSamplingWorkerPool,
  RasterSamplingWorkerPoolUnavailableError,
  RasterSamplingWorkerPoolSupersededError,
} from "server/raster/rasterSamplingWorkerPool";
import type {
  RasterSamplingWorkerMessage,
  RasterSamplingWorkerRequest,
  RasterSamplingWorkerResponse,
} from "server/raster/rasterSamplingWorkerPool";

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

  closeSuccessfully(): void {
    this.emit("message", { status: "closed" });
  }

  ready(): void {
    this.emit("message", { status: "ready" } satisfies RasterSamplingWorkerResponse);
  }

  succeedTerrain(requestIndex = 0): void {
    this.ready();
    const request = this.requests[requestIndex];
    if (request.type !== "terrain-profile") throw new Error("Expected a terrain-profile request");
    const response: RasterSamplingWorkerResponse = {
      id: request.id,
      type: request.type,
      status: "success",
      result: {
        elevationsMeters: [[10, 11]],
        terrainSlopesDegrees: [[1, null]],
        centerSamples: 2,
        uniqueDemPixels: 12,
        blocksRead: 2,
      },
    };
    this.emit("message", response);
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

    const first = pool.runTerrain(descriptor, path, [2]);
    const second = pool.runTerrain(descriptor, path, [2]);
    expect(worker.requests).toHaveLength(1);

    worker.succeedTerrain();
    await expect(first).resolves.toMatchObject({
      elevationsMeters: [[10, 11]],
      workerId: 1,
      centerSamples: 2,
    });
    expect(worker.requests).toHaveLength(2);

    worker.succeedTerrain(1);
    await expect(second).resolves.toMatchObject({ workerId: 1 });
    await pool.close();
    expect(worker.shutdownRequests).toBe(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("waits for worker cache cleanup before terminating", async () => {
    const worker = new FakeWorker(false);
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });
    const active = pool.runTerrain(descriptor, path, [2]);
    worker.succeedTerrain();
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
    const active = pool.runTerrain(descriptor, path, [2]);
    worker.succeedTerrain();
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

    const active = pool.runTerrain(descriptor, path, [2]);
    const queued = pool.runTerrain(descriptor, path, [2]);
    await expect(pool.runTerrain(descriptor, path, [2])).rejects.toBeInstanceOf(
      RasterSamplingWorkerPoolUnavailableError
    );

    worker.succeedTerrain();
    await active;
    worker.succeedTerrain(1);
    await queued;
    await pool.close();
  });

  it("rejects the active job and replaces a failed worker", async () => {
    const firstWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const workers = [firstWorker, replacementWorker];
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      maxStartupFailures: 1,
      workerFactory: () => workers.shift()!,
    });

    const failed = pool.runTerrain(descriptor, path, [2]);
    const queued = pool.runTerrain(descriptor, path, [2]);
    firstWorker.ready();
    firstWorker.emit("error", new Error("decoder crashed"));

    await expect(failed).rejects.toBeInstanceOf(RasterSamplingWorkerPoolUnavailableError);
    expect(replacementWorker.requests).toHaveLength(1);
    replacementWorker.succeedTerrain();
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

    const failed = pool.runTerrain(descriptor, path, [2]);
    firstWorker.ready();
    firstWorker.emit("exit", 0);

    await expect(failed).rejects.toBeInstanceOf(RasterSamplingWorkerPoolUnavailableError);
    const replacementJob = pool.runTerrain(descriptor, path, [2]);
    replacementWorker.succeedTerrain();
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

    // The first run() assigns a job before startup fails; replacements then fail while idle.
    const primeAndSettle = async (pool: RasterSamplingWorkerPool) => {
      await expect(pool.runTerrain(descriptor, path, [2])).rejects.toBeInstanceOf(
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

    it("backs off and stops startup failures while jobs remain queued", async () => {
      vi.useFakeTimers();
      const created: FakeWorker[] = [];
      const pool = new RasterSamplingWorkerPool({
        size: 1,
        maxStartupFailures: 3,
        respawnDelayMs: 100,
        workerFactory: () => {
          const worker = new FakeWorker();
          created.push(worker);
          return worker;
        },
      });
      try {
        const results = Promise.allSettled(
          Array.from({ length: 10 }, () => pool.runTerrain(descriptor, path, [2]))
        );
        expect(created[0].requests).toHaveLength(1);
        failToStart(created[0]);
        await vi.advanceTimersByTimeAsync(99);
        expect(created).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(created).toHaveLength(2);
        expect(created[1].requests).toHaveLength(1);
        failToStart(created[1]);
        await vi.advanceTimersByTimeAsync(199);
        expect(created).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(created).toHaveLength(3);
        expect(created[2].requests).toHaveLength(1);
        failToStart(created[2]);

        const settled = await results;
        expect(settled).toHaveLength(10);
        settled.forEach((result) => {
          expect(result.status).toBe("rejected");
          if (result.status === "rejected")
            expect(result.reason).toBeInstanceOf(RasterSamplingWorkerPoolUnavailableError);
        });
        await expect(pool.runTerrain(descriptor, path, [2])).rejects.toThrow(/failed to start/);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(created).toHaveLength(3);
      } finally {
        await pool.close();
        vi.useRealTimers();
      }
    });

    it("fails fast without creating workers while unavailable", async () => {
      const { pool, created } = makeFailingPool();
      await primeAndSettle(pool);
      const afterGivingUp = created.length;

      await expect(pool.runTerrain(descriptor, path, [2])).rejects.toThrow(/failed to start/);
      expect(created.length).toBe(afterGivingUp);
      await pool.close();
    });

    it("retries once the unavailable window has elapsed", async () => {
      const { pool, created } = makeFailingPool({ unavailableRetryAfterMs: 0 });
      await primeAndSettle(pool);
      const afterGivingUp = created.length;

      await expect(pool.runTerrain(descriptor, path, [2])).rejects.toBeInstanceOf(
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
        const job = pool.runTerrain(descriptor, path, [2]);
        created[index].succeedTerrain();
        await job;
        created[index].emit("error", new Error("decoder crashed"));
      }

      // Startup never failed, so the pool must not have given up.
      const job = pool.runTerrain(descriptor, path, [2]);
      created[2].succeedTerrain();
      await expect(job).resolves.toMatchObject({ workerId: 3 });
      await pool.close();
    });
  });

  it("dispatches terrain profiles through the same worker and reports queue metrics", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });

    const resultPromise = pool.runTerrain(descriptor, path, [2]);
    expect(worker.requests[0]).toMatchObject({
      type: "terrain-profile",
      samplesPerSegment: [2],
      getElevationOnly: false,
    });
    worker.succeedTerrain();

    await expect(resultPromise).resolves.toMatchObject({
      elevationsMeters: [[10, 11]],
      terrainSlopesDegrees: [[1, null]],
      centerSamples: 2,
      uniqueDemPixels: 12,
      blocksRead: 2,
      workerId: 1,
      queueDurationMs: expect.any(Number),
      executionDurationMs: expect.any(Number),
    });
    await pool.close();
  });

  it("passes elevation-only sampling through to the worker", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });

    const resultPromise = pool.runTerrain(descriptor, path, [2], undefined, true);
    expect(worker.requests[0]).toMatchObject({ getElevationOnly: true });
    worker.succeedTerrain();
    await resultPromise;
    await pool.close();
  });

  it("replaces queued terrain work with the same coalescing key", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      maxQueueSize: 1,
      workerFactory: () => worker,
    });

    const active = pool.runTerrain(descriptor, path, [2], "mission:traverse-a");
    const superseded = pool.runTerrain(descriptor, path, [3], "mission:traverse-b");
    const replacement = pool.runTerrain(descriptor, path, [4], "mission:traverse-b");

    await expect(superseded).rejects.toBeInstanceOf(RasterSamplingWorkerPoolSupersededError);
    expect(worker.requests).toHaveLength(1);
    worker.succeedTerrain();
    await active;
    expect(worker.requests[1]).toMatchObject({ samplesPerSegment: [4] });
    worker.succeedTerrain(1);
    await replacement;
    await pool.close();
  });

  it("keeps differently keyed terrain work in FIFO order", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });

    const active = pool.runTerrain(descriptor, path, [2], "mission:active");
    const firstQueued = pool.runTerrain(descriptor, path, [3], "mission:first");
    const secondQueued = pool.runTerrain(descriptor, path, [4], "mission:second");

    worker.succeedTerrain();
    await active;
    expect(worker.requests[1]).toMatchObject({ samplesPerSegment: [3] });
    worker.succeedTerrain(1);
    await firstQueued;
    expect(worker.requests[2]).toMatchObject({ samplesPerSegment: [4] });
    worker.succeedTerrain(2);
    await secondQueued;
    await pool.close();
  });

  it("does not cancel active terrain work when the same key is submitted", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });

    const active = pool.runTerrain(descriptor, path, [2], "mission:traverse-a");
    const queued = pool.runTerrain(descriptor, path, [3], "mission:traverse-a");

    expect(worker.requests).toHaveLength(1);
    worker.succeedTerrain();
    await expect(active).resolves.toMatchObject({ elevationsMeters: [[10, 11]] });
    expect(worker.requests[1]).toMatchObject({ samplesPerSegment: [3] });
    worker.succeedTerrain(1);
    await queued;
    await pool.close();
  });
});

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

  succeedTerrain(requestIndex = 0): void {
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
      workerFactory: () => workers.shift()!,
    });

    const failed = pool.runTerrain(descriptor, path, [2]);
    const queued = pool.runTerrain(descriptor, path, [2]);
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
    firstWorker.emit("exit", 0);

    await expect(failed).rejects.toBeInstanceOf(RasterSamplingWorkerPoolUnavailableError);
    const replacementJob = pool.runTerrain(descriptor, path, [2]);
    replacementWorker.succeedTerrain();
    await expect(replacementJob).resolves.toMatchObject({ workerId: 2 });
    await pool.close();
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

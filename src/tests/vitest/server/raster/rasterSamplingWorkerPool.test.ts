import { EventEmitter } from "node:events";

import {
  RasterSamplingWorkerPool,
  RasterSamplingWorkerPoolUnavailableError,
} from "server/raster/rasterSamplingWorkerPool";
import type {
  RasterSamplingWorkerRequest,
  RasterSamplingWorkerResponse,
} from "server/raster/rasterSamplingWorkerPool";
import type { RasterMetadata } from "server/raster/types";

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

  postMessage(request: RasterSamplingWorkerRequest): void {
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

  it("rejects weighted capacity and releases it after completion", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      maxAdmittedWeight: 4,
      workerFactory: () => worker,
    });

    const active = pool.run(descriptor, path, [4]);
    await expect(pool.run(descriptor, path, [2])).rejects.toMatchObject({
      code: "RASTER_SAMPLING_BUSY",
    });
    expect(pool.snapshot().admittedWeight).toBe(4);
    worker.succeed();
    await active;
    expect(pool.snapshot().admittedWeight).toBe(0);
    await pool.close();
  });

  it("supersedes older queued generations without replacing the worker", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });
    const active = pool.run(descriptor, path, [2], {
      supersession: { streamKey: "user:1:mission:2:measurement:abc", generation: 1 },
    });
    const queued = pool.run(descriptor, path, [2], {
      supersession: { streamKey: "user:1:mission:2:measurement:abc", generation: 2 },
    });
    const latest = pool.run(descriptor, path, [2], {
      supersession: { streamKey: "user:1:mission:2:measurement:abc", generation: 3 },
    });

    await expect(queued).rejects.toMatchObject({ code: "RASTER_SAMPLING_SUPERSEDED" });
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(pool.snapshot()).toMatchObject({ queueDepth: 1, admittedWeight: 4 });
    worker.succeed();
    await active;
    worker.succeed(1);
    await latest;
    expect(pool.snapshot()).toMatchObject({ admittedWeight: 0, supersededQueuedJobs: 1 });
    await pool.close();
  });

  it("expires queued work before dispatch and releases capacity", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({
      size: 1,
      queueDeadlineMs: 100,
      workerFactory: () => worker,
    });
    const active = pool.run(descriptor, path, [2]);
    const queued = pool.run(descriptor, path, [2]);
    const queuedExpectation = expect(queued).rejects.toMatchObject({
      code: "RASTER_SAMPLING_QUEUE_DEADLINE",
    });
    await vi.advanceTimersByTimeAsync(100);
    await queuedExpectation;
    expect(worker.requests).toHaveLength(1);
    expect(pool.snapshot()).toMatchObject({ queueDepth: 0, admittedWeight: 2 });
    worker.succeed();
    await active;
    await pool.close();
    vi.useRealTimers();
  });

  it("cancels queued work without replacing the worker", async () => {
    const worker = new FakeWorker();
    const pool = new RasterSamplingWorkerPool({ size: 1, workerFactory: () => worker });
    const active = pool.run(descriptor, path, [2]);
    const controller = new AbortController();
    const queued = pool.run(descriptor, path, [2], { signal: controller.signal });
    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: "RASTER_SAMPLING_CANCELLED" });
    expect(pool.snapshot()).toMatchObject({ queueDepth: 0, admittedWeight: 2 });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.succeed();
    await active;
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
});

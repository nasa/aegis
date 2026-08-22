import { EventEmitter } from "node:events";

import {
  ElevationWorkerPool,
  ElevationWorkerPoolUnavailableError,
} from "server/elevation/elevationWorkerPool";
import type {
  ElevationWorkerRequest,
  ElevationWorkerResponse,
} from "server/elevation/elevationWorkerPool";
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
  readonly requests: ElevationWorkerRequest[] = [];
  readonly terminate = vi.fn(async () => 0);

  postMessage(request: ElevationWorkerRequest): void {
    this.requests.push(request);
  }

  override on(event: string, listener: (...args: never[]) => void): this {
    return super.on(event, listener);
  }

  succeed(requestIndex = 0): void {
    const request = this.requests[requestIndex];
    const response: ElevationWorkerResponse = {
      id: request.id,
      status: "success",
      result: {
        elevations: [[10, 11]],
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

describe("ElevationWorkerPool", () => {
  it("reuses a persistent worker and runs queued jobs in order", async () => {
    const worker = new FakeWorker();
    const pool = new ElevationWorkerPool({
      size: 1,
      maxQueueSize: 2,
      workerFactory: () => worker,
    });

    const first = pool.run(descriptor, path, [2]);
    const second = pool.run(descriptor, path, [2]);
    expect(worker.requests).toHaveLength(1);

    worker.succeed();
    await expect(first).resolves.toMatchObject({
      elevations: [[10, 11]],
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
    const pool = new ElevationWorkerPool({
      size: 1,
      maxQueueSize: 1,
      workerFactory: () => worker,
    });

    const active = pool.run(descriptor, path, [2]);
    const queued = pool.run(descriptor, path, [2]);
    await expect(pool.run(descriptor, path, [2])).rejects.toBeInstanceOf(
      ElevationWorkerPoolUnavailableError
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
    const pool = new ElevationWorkerPool({
      size: 1,
      workerFactory: () => workers.shift()!,
    });

    const failed = pool.run(descriptor, path, [2]);
    const queued = pool.run(descriptor, path, [2]);
    firstWorker.emit("error", new Error("decoder crashed"));

    await expect(failed).rejects.toBeInstanceOf(ElevationWorkerPoolUnavailableError);
    expect(replacementWorker.requests).toHaveLength(1);
    replacementWorker.succeed();
    await expect(queued).resolves.toMatchObject({ workerId: 2 });
    await pool.close();
  });
});

import { parentPort } from "node:worker_threads";

import { asError } from "@emss/utils";

import type {
  RasterSamplingWorkerMessage,
  RasterSamplingWorkerResponse,
} from "./rasterSamplingWorkerPool";
import { closeRasterCache } from "./rasterCache";
import { sampleRasterProfile } from "./sampleRasterProfile";

// This module is the entry point for each background Node worker thread created by the API.
// Requests and responses cross the thread boundary as structured-cloned messages.
if (!parentPort) throw new Error("Raster sampling worker must run in a worker thread");

const workerPort = parentPort;
let processing = Promise.resolve();

const handleMessage = async (request: RasterSamplingWorkerMessage): Promise<void> => {
  if (request.type === "shutdown") {
    try {
      await closeRasterCache();
      workerPort.postMessage({ status: "closed" } satisfies RasterSamplingWorkerResponse);
    } catch (error) {
      const workerError = asError(error);
      workerPort.postMessage({
        status: "close-error",
        error: {
          name: workerError.name,
          message: workerError.message,
          stack: workerError.stack,
        },
      } satisfies RasterSamplingWorkerResponse);
    }
    return;
  }

  let response: RasterSamplingWorkerResponse;
  try {
    const result = await sampleRasterProfile(request.descriptor, request.path, request.steps);
    response = { id: request.id, status: "success", result };
  } catch (error) {
    // Error instances are not guaranteed to preserve custom fields through structured cloning,
    // so send the stable diagnostic fields explicitly and reconstruct the error in the pool.
    const workerError = asError(error);
    response = {
      id: request.id,
      status: "error",
      error: {
        name: workerError.name,
        message: workerError.message,
        stack: workerError.stack,
      },
    };
  }
  workerPort.postMessage(response);
};

// Serialize messages so shutdown cannot close a TIFF while a sample is still reading it.
workerPort.on("message", (request: RasterSamplingWorkerMessage) => {
  processing = processing.then(() => handleMessage(request));
});

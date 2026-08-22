import { parentPort } from "node:worker_threads";

import { asError } from "@emss/utils";

import type {
  RasterSamplingWorkerRequest,
  RasterSamplingWorkerResponse,
} from "./rasterSamplingWorkerPool";
import { sampleRasterProfile } from "./sampleRasterProfile";

// This module is the entry point for each background Node worker thread created by the API.
// Requests and responses cross the thread boundary as structured-cloned messages.
if (!parentPort) throw new Error("Raster sampling worker must run in a worker thread");

parentPort.on("message", async (request: RasterSamplingWorkerRequest) => {
  let response: RasterSamplingWorkerResponse;
  try {
    const result = await sampleRasterProfile(request.descriptor, request.path, request.steps);
    response = { id: request.id, status: "success", result };
  } catch (error) {
    const workerError = asError(error);
    response = {
      id: request.id,
      status: "error",
      error: {
        name: workerError.name,
        message: workerError.message,
        stack: workerError.stack,
        code: "code" in workerError ? String(workerError.code) : undefined,
      },
    };
  }
  parentPort.postMessage(response);
});

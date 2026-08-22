export type RasterSamplingErrorCode =
  | "RASTER_SAMPLING_CLOSED"
  | "RASTER_SAMPLING_BUSY"
  | "RASTER_SAMPLING_QUEUE_DEADLINE"
  | "RASTER_SAMPLING_SUPERSEDED"
  | "RASTER_SAMPLING_CANCELLED"
  | "RASTER_SAMPLING_TIMEOUT"
  | "RASTER_SAMPLING_WORKER_FAILED";

export class RasterSamplingError extends Error {
  constructor(
    readonly code: RasterSamplingErrorCode,
    message: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "RasterSamplingError";
  }
}

export class RasterSamplingWorkerPoolUnavailableError extends RasterSamplingError {
  constructor(
    message: string,
    code: RasterSamplingErrorCode = "RASTER_SAMPLING_BUSY",
    retryAfterMs?: number
  ) {
    super(code, message, retryAfterMs);
    this.name = "RasterSamplingWorkerPoolUnavailableError";
  }
}

export class RasterSamplingSupersededError extends RasterSamplingError {
  constructor() {
    super("RASTER_SAMPLING_SUPERSEDED", "Raster sampling request was superseded");
    this.name = "RasterSamplingSupersededError";
  }
}

export class RasterSamplingCancelledError extends RasterSamplingError {
  constructor() {
    super("RASTER_SAMPLING_CANCELLED", "Raster sampling request was cancelled");
    this.name = "RasterSamplingCancelledError";
  }
}

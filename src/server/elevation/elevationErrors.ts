export type ElevationErrorCode =
  | "ELEVATION_INVALID_REQUEST"
  | "ELEVATION_TOO_MANY_SAMPLES"
  | "ELEVATION_TOO_MANY_VERTICES"
  | "ELEVATION_RATE_LIMITED"
  | "ELEVATION_BUSY"
  | "ELEVATION_QUEUE_DEADLINE"
  | "ELEVATION_SUPERSEDED"
  | "ELEVATION_TIMEOUT"
  | "ELEVATION_DEM_UNAVAILABLE"
  | "ELEVATION_SAMPLING_FAILED";

export class ElevationRequestError extends Error {
  constructor(
    readonly code: ElevationErrorCode,
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ElevationRequestError";
  }
}

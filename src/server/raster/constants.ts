import { availableParallelism } from "node:os";

export const MAX_RASTER_PROFILE_SAMPLES = 100_000;
export const DEFAULT_RASTER_SAMPLING_WORKERS = Math.min(4, Math.max(1, availableParallelism() - 1));
export const DEFAULT_RASTER_SAMPLING_MAX_QUEUE = 6;
export const DEFAULT_RASTER_SAMPLING_MAX_ADMITTED_SAMPLES = 200_000;
export const DEFAULT_RASTER_SAMPLING_QUEUE_DEADLINE_MS = 3_000;
export const DEFAULT_RASTER_SAMPLING_JOB_TIMEOUT_MS = 15_000;

export const estimateRasterProfileSamples = (steps: number[]): number => {
  let totalSamples = 0;
  for (const segmentSteps of steps) {
    if (!Number.isSafeInteger(segmentSteps) || segmentSteps < 0) {
      throw new RasterProfileValidationError("Steps must be non-negative safe integers");
    }
    totalSamples += segmentSteps <= 1 ? 2 : segmentSteps;
    if (!Number.isSafeInteger(totalSamples)) {
      throw new RasterProfileTooLargeError(MAX_RASTER_PROFILE_SAMPLES);
    }
  }
  return totalSamples;
};

export class RasterProfileValidationError extends Error {
  readonly code = "RASTER_PROFILE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "RasterProfileValidationError";
  }
}

export class RasterProfileTooLargeError extends Error {
  readonly code = "RASTER_PROFILE_TOO_LARGE";

  constructor(limit: number) {
    super(`Raster profile exceeds the ${limit} sample limit`);
    this.name = "RasterProfileTooLargeError";
  }
}

export const validateRasterProfileRequest = (pathLength: number, steps: number[]): number => {
  if (pathLength < 2) {
    throw new RasterProfileValidationError("A raster profile requires at least two points");
  }
  if (steps.length !== pathLength - 1) {
    throw new RasterProfileValidationError("Steps must contain one value for each path segment");
  }
  const estimatedSamples = estimateRasterProfileSamples(steps);
  if (estimatedSamples > MAX_RASTER_PROFILE_SAMPLES) {
    throw new RasterProfileTooLargeError(MAX_RASTER_PROFILE_SAMPLES);
  }
  return estimatedSamples;
};

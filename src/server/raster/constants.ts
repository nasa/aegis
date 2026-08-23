export const MAX_RASTER_PROFILE_SAMPLES = 100_000;

/** Number of samples to take along a segment given its distance and the raster's resolution. */
export const samplesForDistance = (distance: number, resolutionMeters: number): number =>
  Math.max(2, Math.ceil(distance / resolutionMeters) + 1);

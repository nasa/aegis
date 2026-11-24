/** Sentinel used by the terrain sampler for cells outside DEM coverage or marked NoData. */
export const TERRAIN_PROFILE_NO_DATA_ELEVATION_METERS = -1100101;

export const isKnownElevation = (value: number | null | undefined): boolean =>
  Number.isFinite(value) && value !== TERRAIN_PROFILE_NO_DATA_ELEVATION_METERS;

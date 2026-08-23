export type CompleteTerrainProfile = {
  elevationsMeters: number[][];
  terrainSlopesDegrees: (number | null)[][];
};

/** Validate that all derived arrays describe the same path revision. */
export function normalizeTerrainProfile(
  profile: TerrainProfile | undefined,
  path: AEGISPoint[],
  pathSegmentDistances: number[]
): CompleteTerrainProfile | null {
  const segmentCount = path.length - 1;
  if (
    !profile ||
    pathSegmentDistances.length !== segmentCount ||
    profile.elevationsMeters.length !== segmentCount ||
    profile.terrainSlopesDegrees.length !== segmentCount
  ) {
    return null;
  }

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
    const elevations = profile.elevationsMeters[segmentIndex];
    const slopes = profile.terrainSlopesDegrees[segmentIndex];
    if (
      !Array.isArray(elevations) ||
      !Array.isArray(slopes) ||
      elevations.length < 2 ||
      elevations.length !== slopes.length ||
      !elevations.every((value) => typeof value === "number" && Number.isFinite(value)) ||
      !slopes.every(
        (value) => value === null || (typeof value === "number" && Number.isFinite(value))
      )
    ) {
      return null;
    }
  }

  return profile as CompleteTerrainProfile;
}

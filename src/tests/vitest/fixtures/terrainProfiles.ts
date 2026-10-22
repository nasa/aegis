export const terrainProfiles: TerrainProfiles = {};

export function seedTerrainProfile(traverse: Traverse, elevationsMeters: number[][]): void {
  terrainProfiles[traverse.uuid] = {
    fingerprint: JSON.stringify([traverse.uuid, elevationsMeters]),
    path: traverse.path,
    distances: traverse.pathSegmentDistances,
    status: "ready",
    error: null,
    profile: {
      elevationsMeters,
      terrainSlopesDegrees: elevationsMeters.map((segment) => segment.map((): null => null)),
    },
  };
}

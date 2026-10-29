/** Identifies the geometry, sampling settings, and DEM used by a profile. */
export const profileInputSignature = (
  mission: Pick<Mission, "id" | "demFilePath" | "demResolution">,
  path: Pick<AEGISPoint, "lat" | "lng">[],
  distances: number[]
): string =>
  JSON.stringify([
    mission.id,
    mission.demFilePath,
    mission.demResolution ?? 10,
    path.map((point) => [point.lat, point.lng]),
    distances,
  ]);

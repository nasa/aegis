import type { DocHandle } from "@automerge/automerge-repo/slim";
import { resolveMissionDemPath } from "server/raster/missionDems";
import { readTerrainProfileInWorker } from "./readTerrainProfile";
import { isKnownElevation } from "utils/elevation";
import { serverLogger } from "utils/logging/serverLogger";

const inputs = (mission: Mission): string =>
  JSON.stringify([
    mission.id,
    mission.demFilePath,
    mission.demResolution,
    mission.landerLocation?.lat,
    mission.landerLocation?.lng,
  ]);

export async function calculateMissionLanderElevation(mission: Mission): Promise<number | null> {
  const point = mission.landerLocation;
  if (
    !mission.id ||
    !mission.demFilePath ||
    !Number.isFinite(point?.lat) ||
    !Number.isFinite(point?.lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180
  )
    return null;
  const absolutePath = await resolveMissionDemPath(mission.id, mission.demFilePath);
  const profile = await readTerrainProfileInWorker(
    {
      absolutePath,
      ...(mission.demResolution > 0 ? { expectedResolutionMeters: mission.demResolution } : {}),
    },
    [point, point],
    [2],
    `${mission.id}:lander-elevation`,
    true
  );
  const elevation = profile.elevationsMeters[0]?.[0];
  return isKnownElevation(elevation) ? elevation : null;
}

function setElevation(mission: Mission, elevation: number | null): void {
  mission.landerElevationMeters = elevation;
  for (const station of Object.values(mission.stations ?? {})) {
    if (station.isLanderXgress) station.elevation = elevation;
  }
}

/** Derive elevation for edits from any client; never publish a sample for an older location/DEM. */
const watched = new WeakSet<DocHandle<Mission>>();
export function watchLanderElevation(handle: DocHandle<Mission>): void {
  if (watched.has(handle)) return;
  watched.add(handle);
  let previous: string | undefined;
  let stopped = false;
  const refresh = () => {
    if (stopped || !handle.isReady()) return;
    const mission = handle.doc();
    if (!mission?.id) return;
    const signature = inputs(mission);
    if (signature === previous) return;
    previous = signature;
    if (
      mission.landerElevationMeters !== null ||
      Object.values(mission.stations ?? {}).some(
        (station) => station.isLanderXgress && station.elevation !== null
      )
    )
      handle.change((draft) => setElevation(draft, null));
    calculateMissionLanderElevation(mission)
      .then((elevation) => {
        if (stopped || !handle.isReady() || inputs(handle.doc()) !== signature) return;
        if (handle.doc().landerElevationMeters !== elevation)
          handle.change((draft) => setElevation(draft, elevation));
      })
      .catch((error) => {
        if (stopped || !handle.isReady() || inputs(handle.doc()) !== signature) return;
        serverLogger.warning({
          logId: "lander-elevation:watchLanderElevation:couldNotDetermineElevationFromDem",
          logValue: `Lander elevation remains unknown; check the DEM and its coverage: ${error}`,
          missionId: mission.id,
        });
      });
  };
  handle.on("change", refresh);
  handle.on("delete", () => {
    stopped = true;
    handle.off("change", refresh);
  });
  handle
    .whenReady()
    .then(refresh)
    .catch(() => {});
}

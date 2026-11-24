import { unlink } from "node:fs/promises";
import { asError } from "@emss/utils";
import type { AutomergeMigration } from "server/automerge/migrations/types";
import { serverLogger } from "utils/logging/serverLogger";

type MigrationPlanet = "earth" | "moon" | "mars";
type LegacyMission = Omit<Mission, "planet"> & {
  planet?: MigrationPlanet;
  planetRadius?: number | null;
  usingLGRSCoordinates?: boolean;
  gridRenderMode?: "server-file" | "dynamic-lgrs";
  gridSystem?: "moon-m2025" | "earth-wgs84";
};

const planetRadii = { earth: 6378137, moon: 1737400, mars: 3389500 } as const;

function migrateMissionPlanet(mission: LegacyMission): void {
  if (mission.planet == null) {
    const radius = mission.planetRadius;
    const planet =
      radius == null || radius === 0
        ? "moon"
        : (Object.keys(planetRadii) as MigrationPlanet[]).find(
            (planet) => Math.abs(planetRadii[planet] - radius) < 10000
          );
    if (!planet) throw new Error(`Unsupported legacy planet radius: ${radius}`);
    mission.planet = planet;
  }
  delete mission.planetRadius;
  delete mission.usingLGRSCoordinates;
  delete mission.gridRenderMode;
}

function recalculateMissionDistances(mission: LegacyMission): void {
  const radius = planetRadii[mission.planet];
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const distances = (points: AEGISPoint[]): number[] =>
    points.slice(1).map((point, index) => {
      const previous = points[index];
      if (!point || !previous) return 0;
      const dLat = radians(previous.lat - point.lat);
      const dLon = radians(previous.lng - point.lng);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(radians(point.lat)) *
          Math.cos(radians(previous.lat)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      return radius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    });
  const differs = (before: number[] | null, after: number[]): boolean =>
    before?.length !== after.length || after.some((distance, index) => distance !== before[index]);
  for (const traverse of Object.values(mission.traverses ?? {})) {
    if (!traverse.path) continue;
    const updated = distances(traverse.path);
    if (differs(traverse.pathSegmentDistances, updated)) traverse.pathSegmentDistances = updated;
  }
  for (const station of Object.values(mission.stations ?? {})) {
    if (!station.walkbackPath) continue;
    const updated = distances(station.walkbackPath);
    if (differs(station.walkbackPathSegmentDistances, updated))
      station.walkbackPathSegmentDistances = updated;
  }
}

/** Deletes a non-Earth mission's uploaded grid file; a missing file is ignored. */
async function deleteUploadedGridFile(missionId: number, fileName: string): Promise<void> {
  const filePath = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${fileName}`;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    serverLogger.error(
      {
        logId: "automerge-migration:Migration20261119000000:failedToDeleteNonEarthGridFile",
        logValue: `Error deleting grid file ${filePath}`,
        missionId,
      },
      asError(error)
    );
  }
}

export const Migration20261119000000: AutomergeMigration = {
  version: 20261119000000,
  name: "configure-mission-planet-and-grid",
  migrate: async (docHandle) => {
    let removedGrid: { missionId: number; fileName: string } | null = null;
    docHandle.change((mission: LegacyMission) => {
      migrateMissionPlanet(mission);
      delete mission.gridSystem;
      if (mission.earthGridLabelScheme === undefined) mission.earthGridLabelScheme = "lunar-acc";
      if (mission.planet !== "earth") {
        if (mission.serverFileGrid) {
          removedGrid = { missionId: mission.id, fileName: mission.serverFileGrid.fileName };
        }
        mission.serverFileGrid = null;
      }
      if (!mission.demFilePath) mission.landerElevationMeters = null;
      recalculateMissionDistances(mission);
    });
    if (removedGrid) await deleteUploadedGridFile(removedGrid.missionId, removedGrid.fileName);
  },
};

import type { AutomergeMigration } from "server/automerge/migrations/types";

type MigrationPlanet = "earth" | "moon" | "mars";
type LegacyMission = Omit<Mission, "planet"> & {
  planet?: MigrationPlanet;
  planetRadius?: number | null;
  usingLGRSCoordinates?: boolean;
  gridRenderMode?: "server-file" | "dynamic-lgrs";
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

export const Migration20261105000000: AutomergeMigration = {
  version: 20261105000000,
  name: "select-mission-planet",
  migrate: async (docHandle) => {
    docHandle.change((mission: LegacyMission) => {
      migrateMissionPlanet(mission);
      const latitude = mission.landerLocation?.lat;
      if (
        mission.planet === "moon" &&
        Number.isFinite(latitude) &&
        latitude < -80 &&
        latitude >= -90
      )
        mission.serverFileGrid = null;
      if (!mission.demFilePath) mission.landerElevationMeters = null;
      recalculateMissionDistances(mission);
    });
  },
};

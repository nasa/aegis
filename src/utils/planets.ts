/** Supported mission bodies. Radii are metres; Earth retains the existing WGS84 radius. */
export const PLANETS = {
  earth: { name: "Earth", radius: 6378137, maxZoom: 19 },
  moon: { name: "Moon", radius: 1737400, maxZoom: 17 },
  mars: { name: "Mars", radius: 3389500, maxZoom: 17 },
} as const;

export const getPlanetRadius = (mission: Pick<Mission, "planet"> | null | undefined): number =>
  PLANETS[mission?.planet ?? "moon"].radius;

/** The current LGRS implementation supports the lunar south polar cap. */
export const usesLgrsCoordinates = (
  mission: Pick<Mission, "planet" | "landerLocation">
): boolean => {
  const latitude = mission.landerLocation?.lat;
  return (
    mission.planet === "moon" && Number.isFinite(latitude) && latitude < -80 && latitude >= -90
  );
};

/** Only used to upgrade legacy mission documents; never infer identity from radius at runtime. */
export const planetFromLegacyRadius = (radius: number | null | undefined): Planet => {
  if (radius == null || radius === 0) return "moon";
  const match = (Object.keys(PLANETS) as Planet[]).find(
    (planet) => Math.abs(PLANETS[planet].radius - radius) < 10000
  );
  if (!match) throw new Error(`Unsupported legacy planet radius: ${radius}`);
  return match;
};

export type LegacyPlanetFields = {
  planet?: Planet;
  planetRadius?: number | null;
  usingLGRSCoordinates?: boolean;
  gridRenderMode?: GridRenderMode;
};

export const migrateMissionPlanet = (mission: LegacyPlanetFields): void => {
  mission.planet ??= planetFromLegacyRadius(mission.planetRadius);
  delete mission.planetRadius;
  delete mission.usingLGRSCoordinates;
  delete mission.gridRenderMode;
};

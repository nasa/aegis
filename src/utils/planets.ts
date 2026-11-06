/** Supported mission bodies. Radii are metres; Earth retains the existing WGS84 radius. */
export const PLANETS = {
  earth: { name: "Earth", radius: 6378137, maxZoom: 19 },
  moon: { name: "Moon", radius: 1737400, maxZoom: 17 },
  mars: { name: "Mars", radius: 3389500, maxZoom: 17 },
} as const;

export const getPlanetRadius = (mission: Pick<Mission, "planet"> | null | undefined): number =>
  PLANETS[mission?.planet ?? "moon"].radius;

/** Manual grid uploads are supported only for Earth missions. */
export const supportsUploadedGrid = (mission: Pick<Mission, "planet">): boolean =>
  mission.planet === "earth";

/** Uploaded Earth grids use custom labels; dynamic Earth and Moon grids use the library. */
export const usesGridCoordinates = (mission: Pick<Mission, "planet" | "serverFileGrid">): boolean =>
  mission.planet === "moon" || (mission.planet === "earth" && !mission.serverFileGrid);

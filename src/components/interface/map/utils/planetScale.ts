import { PLANETS } from "utils/planets";

export function maxZoomForPlanet(planet: Planet | null | undefined): number {
  return PLANETS[planet ?? "moon"].maxZoom;
}

/**
 * Grid system for a planet radius. Mission creation and the admin editor persist
 * this selection in `mission.gridSystem` for the map and coordinate readouts.
 */
export function suggestGridSystemId(planetRadius: number | null | undefined): MissionGridSystemId {
  return isEarthScale(planetRadius) ? "earth-wgs84" : "moon-m2025";
}

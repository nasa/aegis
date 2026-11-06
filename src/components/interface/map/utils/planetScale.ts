import { PLANETS } from "utils/planets";

export function maxZoomForPlanet(planet: Planet | null | undefined): number {
  return PLANETS[planet ?? "moon"].maxZoom;
}

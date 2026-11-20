import type View from "ol/View";
import { toLonLat } from "ol/proj";
import { getDistance } from "ol/sphere";

export const GRID_INTERVAL_PROPERTY = "aegisGridInterval";
export type DrawnGridInterval = number | "lgrs-zones" | null;

const formatNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });
const distanceUnits = [
  { meters: 1000, symbol: "km", name: "kilometers" },
  { meters: 1, symbol: "m", name: "meters" },
  { meters: 0.01, symbol: "cm", name: "centimeters" },
  { meters: 0.001, symbol: "mm", name: "millimeters" },
];

export function getMapDistanceLabel(meters: number): {
  value: string;
  symbol: string;
  unitName: string;
} {
  const unit = distanceUnits.find((candidate) => meters >= candidate.meters) ?? distanceUnits[3];
  return {
    value: formatNumber.format(meters / unit.meters),
    symbol: unit.symbol,
    unitName: unit.name,
  };
}

export function formatMapDistance(meters: number, unitSeparator = " "): string {
  const { value, symbol } = getMapDistanceLabel(meters);
  return `${value}${unitSeparator}${symbol}`;
}

/** Ground distance along one horizontal screen pixel at the view centre. */
export function getGroundMetersPerPixel(view: View, planetRadius?: number): number {
  const center = view.getCenter();
  const resolution = view.getResolution();
  if (!center || !resolution) return 0;

  const projection = view.getProjection();
  const rotation = view.getRotation();
  const dx = (resolution * Math.cos(rotation)) / 2;
  const dy = (resolution * Math.sin(rotation)) / 2;
  return getDistance(
    toLonLat([center[0] - dx, center[1] - dy], projection),
    toLonLat([center[0] + dx, center[1] + dy], projection),
    planetRadius
  );
}

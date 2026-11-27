import type View from "ol/View";
import { toLonLat } from "ol/proj";
import { getDistance } from "ol/sphere";

const formatNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });
const distanceUnits = [
  { meters: 1000, symbol: "km" },
  { meters: 1, symbol: "m" },
];

function getDistanceUnit(meters: number) {
  return distanceUnits.find((candidate) => meters >= candidate.meters) ?? distanceUnits[1];
}

const maxScaleBarWidth = 150;
// Each total has subdivisions whose steps are 1, 2, 2.5, or 5 times a power of ten.
// Unlabelled bars use few whole-number steps so segments are easy to count.
const scaleBarTotals = [
  { multiplier: 5, segmentCounts: [10, 5, 2, 1], unlabelledSegments: 5 },
  { multiplier: 2, segmentCounts: [10, 4, 2, 1], unlabelledSegments: 2 },
  { multiplier: 1, segmentCounts: [10, 5, 4, 2, 1], unlabelledSegments: 2 },
];

type ScaleBarLayout = {
  width: number;
  ticks: string[];
  symbol: string;
};

export function getScaleBarLayout(
  metersPerPixel: number,
  { fontScale, showTickLabels }: Pick<ScaleBarConfig, "fontScale" | "showTickLabels"> = {
    fontScale: 1,
    showTickLabels: true,
  }
): ScaleBarLayout | null {
  // Allow a fraction of a pixel for rounding at an exact distance threshold.
  const maxDistance = (maxScaleBarWidth + 1e-6) * metersPerPixel;
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return null;

  const power = Math.floor(Math.log10(maxDistance));
  const magnitude = 10 ** power;
  // log10 can round up to a whole number just below a power of ten.
  const decade = magnitude <= maxDistance ? magnitude : 10 ** (power - 1);
  const total = scaleBarTotals.find(({ multiplier }) => multiplier * decade <= maxDistance);
  if (!total) return null;

  const distance = total.multiplier * decade;
  const width = distance / metersPerPixel;
  const unit = getDistanceUnit(distance);
  const value = distance / unit.meters;

  const getTicks = (segments: number) =>
    Array.from({ length: segments + 1 }, (_, index) =>
      formatNumber.format((index / segments) * value)
    );
  if (!showTickLabels) {
    return { width, ticks: getTicks(total.unlabelledSegments), symbol: unit.symbol };
  }

  // At 0.8em, allow roughly 7.5px per character plus 3px between labels for the halos.
  const charPixels = 7.5 * fontScale;
  for (const segments of total.segmentCounts) {
    const stepPixels = width / segments;
    const ticks = getTicks(segments);
    const labelsFit = ticks.every(
      (label, index) =>
        index === 0 || stepPixels >= ((label.length + ticks[index - 1].length) * charPixels) / 2 + 3
    );
    if (labelsFit) return { width, ticks, symbol: unit.symbol };
  }

  return null;
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

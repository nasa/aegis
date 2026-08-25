import paper from "paper";

export interface SlopeClass {
  minExclusive: number;
  maxInclusive: number;
  label: string;
  color: string;
}

// Standard XI4 GIS ramp: reversed ColorBrewer RdYlBu with purple above 20 degrees.
export const SLOPE_CLASSES: ReadonlyArray<SlopeClass> = [
  { minExclusive: -Infinity, maxInclusive: 2, label: "0–2°", color: "#313695" },
  { minExclusive: 2, maxInclusive: 4, label: ">2–4°", color: "#4575b4" },
  { minExclusive: 4, maxInclusive: 6, label: ">4–6°", color: "#74add1" },
  { minExclusive: 6, maxInclusive: 8, label: ">6–8°", color: "#abd9e9" },
  { minExclusive: 8, maxInclusive: 10, label: ">8–10°", color: "#e0f3f8" },
  { minExclusive: 10, maxInclusive: 12, label: ">10–12°", color: "#ffffbf" },
  { minExclusive: 12, maxInclusive: 14, label: ">12–14°", color: "#fee090" },
  { minExclusive: 14, maxInclusive: 16, label: ">14–16°", color: "#fdae61" },
  { minExclusive: 16, maxInclusive: 18, label: ">16–18°", color: "#f46d43" },
  { minExclusive: 18, maxInclusive: 20, label: ">18–20°", color: "#d73027" },
  { minExclusive: 20, maxInclusive: Infinity, label: ">20°", color: "#301f42" },
];

// Accessible seven-class YlOrRd ramp. Shallow graph segments are pale yellow; hazards above 20° use
// the same GIS purple as the standard ramp. The corresponding raster makes 0–2° transparent.
export const COLORBLIND_SLOPE_CLASSES: ReadonlyArray<SlopeClass> = [
  { minExclusive: -Infinity, maxInclusive: 2, label: "0–2°", color: "#ffffcc" },
  { minExclusive: 2, maxInclusive: 4, label: ">2–4°", color: "#ffefa5" },
  { minExclusive: 4, maxInclusive: 8, label: ">4–8°", color: "#fedd7f" },
  { minExclusive: 8, maxInclusive: 12, label: ">8–12°", color: "#fd9d43" },
  { minExclusive: 12, maxInclusive: 16, label: ">12–16°", color: "#f43d25" },
  { minExclusive: 16, maxInclusive: 20, label: ">16–20°", color: "#b60026" },
  { minExclusive: 20, maxInclusive: Infinity, label: ">20°", color: "#301f42" },
];

export const getSlopeClasses = (mode: SlopeColorMode): ReadonlyArray<SlopeClass> =>
  mode === "colorblind" ? COLORBLIND_SLOPE_CLASSES : SLOPE_CLASSES;

export const getSlopeClass = (
  slopeDegrees: number,
  mode: SlopeColorMode = "standard"
): SlopeClass | undefined => {
  const magnitude = Math.abs(slopeDegrees);
  return getSlopeClasses(mode).find(
    ({ minExclusive, maxInclusive }) => magnitude > minExclusive && magnitude <= maxInclusive
  );
};

export function drawSlopeSeparator(
  group: paper.Group,
  left: number,
  right: number,
  y: number,
  strokeColor: paper.Color
): void {
  group.addChild(
    new paper.Path.Line({
      from: new paper.Point(left, y),
      to: new paper.Point(right, y),
      strokeColor,
      strokeWidth: 1,
    })
  );
}

export function drawSlopeBand(
  group: paper.Group,
  graphData: GraphDataItem[],
  top: number,
  height: number,
  maxX = Infinity,
  colorMode: SlopeColorMode = "standard"
): void {
  for (let index = 0; index < graphData.length - 1; index++) {
    const start = graphData[index];
    const end = graphData[index + 1];
    const startDistance = start.distanceMeters;
    const endDistance = end.distanceMeters;
    if (startDistance == null || endDistance == null || endDistance <= startDistance) continue;

    if (start.slopeDegrees == null || end.slopeDegrees == null) continue;
    const slopeClass = getSlopeClass((start.slopeDegrees + end.slopeDegrees) / 2, colorMode);
    if (!slopeClass) continue;
    const right = Math.min(maxX, Math.max(end.xPixel, start.xPixel + 1));
    group.addChild(
      new paper.Path.Rectangle({
        from: new paper.Point(start.xPixel, top),
        to: new paper.Point(right, top + height),
        fillColor: new paper.Color(slopeClass.color),
      })
    );
  }
}

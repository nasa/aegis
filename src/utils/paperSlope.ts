import paper from "paper";

// Previous ColorBrewer RdYlBu ramp.
// const SLOPE_COLORS = [
//   "#313695",
//   "#4575b4",
//   "#74add1",
//   "#abd9e9",
//   "#e0f3f8",
//   "#ffffbf",
//   "#fee090",
//   "#fdae61",
//   "#f46d43",
//   "#d73027",
//   "#301f42",
// ];

// ColorBrewer YlOrRd interpolated to ten classes, with the GIS purple above 20 degrees.
export const SLOPE_CLASSES: ReadonlyArray<{
  minExclusive: number;
  maxInclusive: number;
  label: string;
  color: string;
}> = [
  { minExclusive: -Infinity, maxInclusive: 2, label: "0–2°", color: "#ffffcc" },
  { minExclusive: 2, maxInclusive: 4, label: ">2–4°", color: "#ffefa5" },
  { minExclusive: 4, maxInclusive: 6, label: ">4–6°", color: "#fedd7f" },
  { minExclusive: 6, maxInclusive: 8, label: ">6–8°", color: "#febf5a" },
  { minExclusive: 8, maxInclusive: 10, label: ">8–10°", color: "#fd9d43" },
  { minExclusive: 10, maxInclusive: 12, label: ">10–12°", color: "#fc7134" },
  { minExclusive: 12, maxInclusive: 14, label: ">12–14°", color: "#f43d25" },
  { minExclusive: 14, maxInclusive: 16, label: ">14–16°", color: "#db141e" },
  { minExclusive: 16, maxInclusive: 18, label: ">16–18°", color: "#b60026" },
  { minExclusive: 18, maxInclusive: 20, label: ">18–20°", color: "#800026" },
  { minExclusive: 20, maxInclusive: Infinity, label: ">20°", color: "#301f42" },
];

export const getSlopeClass = (slopeDegrees: number): (typeof SLOPE_CLASSES)[number] | undefined => {
  const magnitude = Math.abs(slopeDegrees);
  return SLOPE_CLASSES.find(
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
  maxX = Infinity
): void {
  for (let index = 0; index < graphData.length - 1; index++) {
    const start = graphData[index];
    const end = graphData[index + 1];
    const startDistance = start.distanceMeters;
    const endDistance = end.distanceMeters;
    if (startDistance == null || endDistance == null || endDistance <= startDistance) continue;

    if (start.slopeDegrees == null || end.slopeDegrees == null) continue;
    const slopeClass = getSlopeClass((start.slopeDegrees + end.slopeDegrees) / 2);
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

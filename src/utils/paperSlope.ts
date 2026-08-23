import paper from "paper";

// Previous ColorBrewer RdYlBu ramp.
// const SLOPE_COLORS = [
//   "#313695", // 0.021-2 degrees
//   "#4575b4", // 2.001-4 degrees
//   "#74add1", // 4.001-6 degrees
//   "#abd9e9", // 6.001-8 degrees
//   "#e0f3f8", // 8.001-10 degrees
//   "#ffffbf", // 10.001-12 degrees
//   "#fee090", // 12.001-14 degrees
//   "#fdae61", // 14.001-16 degrees
//   "#f46d43", // 16.001-18 degrees
//   "#d73027", // 18.001-20 degrees
//   "#301f42", // Above 20 degrees
// ];

// ColorBrewer YlOrRd interpolated to ten classes, with the GIS purple above 20 degrees.
const SLOPE_COLORS = [
  "#ffffcc", // 0.021-2 degrees
  "#ffefa5", // 2.001-4 degrees
  "#fedd7f", // 4.001-6 degrees
  "#febf5a", // 6.001-8 degrees
  "#fd9d43", // 8.001-10 degrees
  "#fc7134", // 10.001-12 degrees
  "#f43d25", // 12.001-14 degrees
  "#db141e", // 14.001-16 degrees
  "#b60026", // 16.001-18 degrees
  "#800026", // 18.001-20 degrees
  "#301f42", // Above 20 degrees
];

const getSlopeClassIndex = (slopeDegrees: number): number =>
  Math.min(Math.floor(Math.abs(slopeDegrees) / 2), SLOPE_COLORS.length - 1);

const drawSlopePattern = (
  group: paper.Group,
  left: number,
  right: number,
  top: number,
  height: number,
  patternClass: number,
  color: paper.Color
): void => {
  if (patternClass === 0 || right - left < 2) return;

  const addHatch = (descending: boolean) => {
    for (let x = left - height; x < right; x += 6) {
      const startX = Math.max(left, x);
      const endX = Math.min(right, x + height);
      if (endX <= startX) continue;
      const startOffset = startX - x;
      const endOffset = endX - x;
      group.addChild(
        new paper.Path.Line({
          from: new paper.Point(
            startX,
            descending ? top + startOffset : top + height - startOffset
          ),
          to: new paper.Point(endX, descending ? top + endOffset : top + height - endOffset),
          strokeColor: color,
          strokeWidth: 1,
          opacity: 0.45,
        })
      );
    }
  };

  if (patternClass === 1) {
    for (let x = left + 3; x < right; x += 6) {
      group.addChild(
        new paper.Path.Circle({
          center: new paper.Point(x, top + height / 2),
          radius: 1,
          fillColor: color,
          opacity: 0.55,
        })
      );
    }
    return;
  }

  addHatch(patternClass !== 3);
  if (patternClass >= 4) addHatch(false);
};

export function drawSlopeBand(
  group: paper.Group,
  graphData: GraphDataItem[],
  top: number,
  height: number,
  patternColor: paper.Color,
  maxX = Infinity
): void {
  for (let index = 0; index < graphData.length - 1; index++) {
    const start = graphData[index];
    const end = graphData[index + 1];
    const startDistance = start.distanceMeters;
    const endDistance = end.distanceMeters;
    if (startDistance == null || endDistance == null || endDistance <= startDistance) continue;

    const slopeDegrees = ((start.slopeDegrees ?? 0) + (end.slopeDegrees ?? 0)) / 2;
    const slopeClass = getSlopeClassIndex(slopeDegrees);
    const right = Math.min(maxX, Math.max(end.xPixel, start.xPixel + 1));
    group.addChild(
      new paper.Path.Rectangle({
        from: new paper.Point(start.xPixel, top),
        to: new paper.Point(right, top + height),
        fillColor: new paper.Color(SLOPE_COLORS[slopeClass]),
      })
    );
    drawSlopePattern(
      group,
      start.xPixel,
      right,
      top,
      height,
      Math.min(Math.floor(slopeClass / 2), 4),
      patternColor
    );
  }
}

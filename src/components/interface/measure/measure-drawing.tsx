import type { MutableRefObject } from "react";
import paper from "paper";
import { drawMeterMarker } from "../timeline/timeline-drawing";
import type { Dispatch } from "@reduxjs/toolkit";
import { clearMapItemHover, setMeasurementHover } from "store/hover";
import { getGraphSlopeAtX, getHoverValue } from "utils/paper";
import { drawSlopeBand, drawSlopeSeparator } from "utils/paperSlope";

export function drawGraphAxes(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>
): void {
  if (!measurePaperDataRef.current || !measurePaperDataRef.current.paperVars) return;
  const paperVars = measurePaperDataRef.current.paperVars;
  const axisGroup = measurePaperGroupsRef.current.axisGroup;
  const paperStyles = measurePaperDataRef.current.styles;
  const graphBottom = paperVars.terrainSlopeTop + paperVars.terrainSlopeHeight;

  //draw top and bottom lines
  const topLine = new paper.Path.Line({
    from: new paper.Point(paperVars.drawingLeft, paperVars.drawingTop),
    to: new paper.Point(paperVars.drawingLeft + paperVars.drawingWidth, paperVars.drawingTop),
    strokeColor: paperStyles.grey3,
  });
  const bottomLine = new paper.Path.Line({
    from: new paper.Point(paperVars.drawingLeft, graphBottom),
    to: new paper.Point(paperVars.drawingLeft + paperVars.drawingWidth, graphBottom),
    strokeColor: paperStyles.grey3,
  });
  const leftLine = new paper.Path.Line({
    from: new paper.Point(paperVars.drawingLeft, paperVars.drawingTop),
    to: new paper.Point(paperVars.drawingLeft, graphBottom),
    strokeColor: paperStyles.grey3,
  });
  const rightLine = new paper.Path.Line({
    from: new paper.Point(paperVars.drawingLeft + paperVars.drawingWidth, paperVars.drawingTop),
    to: new paper.Point(paperVars.drawingLeft + paperVars.drawingWidth, graphBottom),
    strokeColor: paperStyles.grey3,
  });
  const background = new paper.Path.Rectangle({
    from: new paper.Point(paperVars.drawingLeft + 1, paperVars.drawingTop + 1),
    to: new paper.Point(paperVars.drawingLeft + paperVars.drawingWidth - 1, graphBottom - 1),
    fillColor: paperStyles.grey1,
  });
  axisGroup.addChildren([topLine, bottomLine, leftLine, rightLine, background]);

  //draw right y-axis label
  const rightYAxisLabelXOffset = 65;
  const rightYAxisLabel = new paper.PointText({
    point: new paper.Point(
      paperVars.drawingLeft + paperVars.drawingWidth + rightYAxisLabelXOffset,
      paperVars.drawingTop - 5
    ),
    justification: "right",
    fontFamily: measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: measurePaperDataRef.current.styles.green,
    content: "Relative Elevation (m)",
  });
  rightYAxisLabel.rotate(
    -90,
    new paper.Point(
      paperVars.drawingLeft + paperVars.drawingWidth + rightYAxisLabelXOffset,
      paperVars.drawingTop - 5
    )
  );
  axisGroup.addChild(rightYAxisLabel);

  const markerSpacingPx = 25; //at least this many pixels between markers
  const possibleIntervalMeters = [
    1, 2, 5, 10, 15, 20, 25, 50, 100, 150, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
  ];

  //draw right y-axis meters markers
  const xLocRightYaxis = paperVars.drawingLeft + paperVars.drawingWidth;

  //right lander horizontal axis line and marker
  drawMeterMarker(
    measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
    xLocRightYaxis,
    paperVars.drawingTop + paperVars.startElevationFromGraphTop,
    `Start`,
    measurePaperDataRef.current.styles.green,
    "left"
  );
  const startLine = new paper.Path.Line({
    from: new paper.Point(
      paperVars.drawingLeft + paperVars.drawingWidth,
      paperVars.drawingTop + paperVars.startElevationFromGraphTop
    ),
    to: new paper.Point(
      paperVars.drawingLeft,
      paperVars.drawingTop + paperVars.startElevationFromGraphTop
    ),
    strokeColor: measurePaperDataRef.current.styles.green,
  });
  axisGroup.addChild(startLine);

  //determine interval for elevation markers
  let elevationInterval = possibleIntervalMeters[0];
  for (let i = 0; i < possibleIntervalMeters.length; i++) {
    const numMarkers =
      (measureDerivedValuesRef.current.maxElevationMeters -
        measureDerivedValuesRef.current.minElevationMeters) /
      possibleIntervalMeters[i];
    //determine how many can fit taking into account the marker spacing pixels
    if (numMarkers < paperVars.graphHeight / markerSpacingPx && i > 0) {
      elevationInterval = possibleIntervalMeters[i - 1];
      break;
    }
  }

  //draw elevation markers
  const elevationIntervalInPixels = elevationInterval * paperVars.pixelsPerMeterElevationY;
  const yLocStartElevation = paperVars.drawingTop + paperVars.startElevationFromGraphTop;
  let markerArea: number;
  let numMarkers: number;

  //draw markers below start
  markerArea = paperVars.graphHeight - paperVars.startElevationFromGraphTop;
  numMarkers = markerArea / elevationIntervalInPixels;
  for (let i = 1; i < numMarkers; i++) {
    drawMeterMarker(
      measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
      xLocRightYaxis,
      yLocStartElevation + elevationIntervalInPixels * i,
      `-${Math.round(i * elevationInterval).toLocaleString("en-US")}`,
      measurePaperDataRef.current.styles.green,
      "left"
    );
  }

  //draw markers above start
  markerArea = paperVars.startElevationFromGraphTop;
  numMarkers = markerArea / elevationIntervalInPixels;
  for (let i = 1; i < numMarkers; i++) {
    drawMeterMarker(
      measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
      xLocRightYaxis,
      yLocStartElevation - elevationIntervalInPixels * i,
      `${Math.round(i * elevationInterval).toLocaleString("en-US")}`,
      measurePaperDataRef.current.styles.green,
      "left"
    );
  }
}

export function drawElevationProfile(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>
): void {
  const paperVars = measurePaperDataRef.current.paperVars;
  const derivedValues = measureDerivedValuesRef.current;
  const yStartPixel = paperVars.drawingTop + paperVars.startElevationFromGraphTop;

  //build points for each sequence and draw
  const fillPoints: number[][] = [];
  const strokePoints: number[][] = [];

  const graphDataItems = derivedValues.elevationGraphValues;
  if (!graphDataItems || graphDataItems.length === 0) return;

  fillPoints.push([graphDataItems[0].xPixel, yStartPixel]);
  for (const graphDataItem of graphDataItems) {
    fillPoints.push([graphDataItem.xPixel, graphDataItem.yPixel]);
    strokePoints.push([graphDataItem.xPixel, graphDataItem.yPixel]);
  }
  fillPoints.push([graphDataItems.at(-1).xPixel, yStartPixel]);

  const elevationFillPath = new paper.Path(fillPoints);
  elevationFillPath.fillColor = measurePaperDataRef.current.styles.green;
  elevationFillPath.opacity = 0.1;

  //build points for the stroke path and draw
  const elevationStrokePath = new paper.Path(strokePoints);
  elevationStrokePath.strokeColor = measurePaperDataRef.current.styles.green;
  elevationStrokePath.opacity = 1;
  elevationStrokePath.strokeWidth = 1.5;

  //draw first and last dots on the elevation graph
  const diamond = new paper.Path.Rectangle({
    point: new paper.Point(
      paperVars.drawingLeft - 3,
      paperVars.drawingTop + paperVars.startElevationFromGraphTop - 3
    ),
    size: 6,
    fillColor: measurePaperDataRef.current.styles.green,
  });
  diamond.rotate(45);

  const diamond2 = new paper.Path.Rectangle({
    point: new paper.Point(
      paperVars.drawingLeft + paperVars.drawingWidth - 3,
      paperVars.drawingTop + paperVars.startElevationFromGraphTop - 3
    ),
    size: 6,
    fillColor: measurePaperDataRef.current.styles.green,
  });
  diamond2.rotate(45);
}

export function drawPathSlope(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>
): void {
  const paperVars = measurePaperDataRef.current.paperVars;
  const slopeGroup = measurePaperGroupsRef.current.pathGradeGroup;
  const graphData = measureDerivedValuesRef.current.elevationGraphValues ?? [];
  slopeGroup.removeChildren();
  drawSlopeBand(
    slopeGroup,
    graphData,
    paperVars.pathGradeTop,
    paperVars.pathGradeHeight,
    paperVars.drawingLeft + paperVars.drawingWidth
  );
}

export function drawTerrainSlope(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>
): void {
  const paperVars = measurePaperDataRef.current.paperVars;
  const paperStyles = measurePaperDataRef.current.styles;
  const group = measurePaperGroupsRef.current.terrainSlopeGroup;
  group.removeChildren();
  drawSlopeBand(
    group,
    measureDerivedValuesRef.current.terrainSlopeGraphValues ?? [],
    paperVars.terrainSlopeTop,
    paperVars.terrainSlopeHeight,
    paperVars.drawingLeft + paperVars.drawingWidth
  );

  drawSlopeSeparator(
    group,
    paperVars.drawingLeft,
    paperVars.drawingLeft + paperVars.drawingWidth,
    paperVars.terrainSlopeTop,
    paperStyles.grey3
  );
}

export function drawMeasureSegmentDistances(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups>,
  pathSegmentDistances: number[] | undefined,
  pathSegmentBearings: number[] | undefined,
  usingLGRSCoordinates: boolean
): void {
  const paperVars = measurePaperDataRef.current.paperVars;
  const paperStyles = measurePaperDataRef.current.styles;
  const graphBottom = paperVars.terrainSlopeTop + paperVars.terrainSlopeHeight;

  const lineSegmentMarksGroup = measurePaperGroupsRef.current.lineSegmentMarksGroup;
  lineSegmentMarksGroup.removeChildren();

  // Early return if no segment distances available
  if (!pathSegmentDistances || pathSegmentDistances.length === 0) return;

  const totalDistance = pathSegmentDistances.reduce(
    (accumulator, currentVal) => accumulator + currentVal,
    0
  );

  // Avoid division by zero
  if (totalDistance === 0) return;

  // draw vertical lines for each segment
  let locX = paperVars.drawingLeft;
  for (let i = 0; i < pathSegmentDistances.length - 1; i++) {
    const segmentDistance = pathSegmentDistances[i];
    const segmentXLoc = locX + (segmentDistance / totalDistance) * paperVars.drawingWidth;
    const line = new paper.Path.Line({
      from: new paper.Point(segmentXLoc, paperVars.drawingTop),
      to: new paper.Point(segmentXLoc, graphBottom),
      strokeColor: paperStyles.grey5,
    });
    lineSegmentMarksGroup.addChild(line);
    locX = segmentXLoc;
  }

  // draw distance labels at the bottom of the graph
  locX = paperVars.drawingLeft;
  let leftLocX = paperVars.drawingLeft;
  for (let i = 0; i < pathSegmentDistances.length; i++) {
    const segmentDistance = pathSegmentDistances[i];
    const rightXLoc = locX + (segmentDistance / totalDistance) * paperVars.drawingWidth;
    const labelLocX = (leftLocX + rightXLoc) / 2;
    const distanceLabel = new paper.PointText({
      point: new paper.Point(labelLocX, graphBottom + 27),
      justification: "center",
      fontFamily: measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
      fontSize: 12,
      fillColor: paperStyles.grey5,
      content: `${segmentDistance.toFixed(0)} m`,
    });
    const leftSegmentArrow = drawLineWithArrowhead(
      new paper.Point(leftLocX, graphBottom + 22),
      new paper.Point(labelLocX - 30, graphBottom + 22),
      paperStyles.grey4,
      1,
      "start"
    );
    const rightSegmentArrow = drawLineWithArrowhead(
      new paper.Point(labelLocX + 30, graphBottom + 22),
      new paper.Point(rightXLoc, graphBottom + 22),
      paperStyles.grey4,
      1,
      "end"
    );
    lineSegmentMarksGroup.addChild(leftSegmentArrow);
    lineSegmentMarksGroup.addChild(rightSegmentArrow);

    lineSegmentMarksGroup.addChild(distanceLabel);

    if (usingLGRSCoordinates && pathSegmentBearings && pathSegmentBearings.length > i) {
      const segmentBearing = pathSegmentBearings[i];
      const bearingLabel = new paper.PointText({
        point: new paper.Point(labelLocX, graphBottom + 12),
        justification: "center",
        fontFamily: measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
        fontSize: 12,
        fillColor: paperStyles.grey5,
        content: `${segmentBearing.toFixed(0)}°`,
      });
      lineSegmentMarksGroup.addChild(bearingLabel);
    }

    leftLocX = rightXLoc;
    locX = rightXLoc;
  }
}

function drawLineWithArrowhead(
  startPoint: paper.Point,
  endPoint: paper.Point,
  color: paper.Color,
  strokeWidth: number,
  headEnd: "start" | "end"
): paper.Group {
  const line = new paper.Path.Line(startPoint, endPoint);
  line.strokeColor = color;
  line.strokeWidth = strokeWidth;

  // make the head start point be the startPoint over 5 pixels
  const headPoint = headEnd === "start" ? startPoint.clone() : endPoint.clone();
  headPoint.x += headEnd === "start" ? 5 : -5;

  const arrowHead = new paper.Path.RegularPolygon(headPoint, 3, 5);
  if (headEnd === "start") {
    arrowHead.rotate(33.3);
  } else {
    arrowHead.rotate(-33.3);
  }

  arrowHead.fillColor = color;
  return new paper.Group([line, arrowHead]);
}

export const drawMouseHover = (
  dispatch: Dispatch,
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>,
  hoverPoint: paper.Point,
  setHoverValues: Function,
  selectedMeasurementUuid: string
): void => {
  if (!measurePaperDataRef.current || !measurePaperDataRef.current.paperVars) return;
  const paperVars = measurePaperDataRef.current.paperVars;
  const paperStyles = measurePaperDataRef.current.styles;
  const derivedValues = measureDerivedValuesRef.current;
  const hoverGroup = measurePaperGroupsRef.current.hoverGroup;

  if (
    hoverPoint.x < paperVars.drawingLeft ||
    hoverPoint.x > paperVars.drawingLeft + paperVars.drawingWidth ||
    hoverPoint.y < paperVars.drawingTop ||
    hoverPoint.y > paperVars.drawingTop + paperVars.drawingHeight
  ) {
    //mouse is outside of the graph area but is still inside paper canvas
    hoverGroup.visible = false;
    dispatch(clearMapItemHover());
    return;
  }

  if (!selectedMeasurementUuid) return;

  //draw hover line
  hoverGroup.removeChildren();

  hoverGroup.addChild(
    new paper.Path.Line({
      from: new paper.Point(paperVars.drawingLeft, hoverPoint.y),
      to: new paper.Point(paperVars.drawingLeft + paperVars.drawingWidth + 10, hoverPoint.y),
      strokeColor: paperStyles.brightBlue,
      strokeWidth: 1,
    })
  );
  hoverGroup.bringToFront();
  hoverGroup.visible = true;

  const hoverLine = new paper.Path.Line({
    from: new paper.Point(hoverPoint.x, paperVars.drawingTop),
    to: new paper.Point(hoverPoint.x, paperVars.terrainSlopeTop + paperVars.terrainSlopeHeight),
    strokeColor: paperStyles.brightBlue,
  });
  hoverGroup.addChild(hoverLine);

  // calc distance using paperVars.drawingWidth and paperVars.drawingWidth as total distance
  const distanceFromStartMeters =
    ((hoverPoint.x - paperVars.drawingLeft) / paperVars.drawingWidth) *
    derivedValues.totalDistanceMeters;

  //get hover values and draw diamonds, when elevation data is available
  const hasElevationData = !!derivedValues.elevationGraphValues?.length;
  const elevationHoverData = hasElevationData
    ? getHoverValue(derivedValues.elevationGraphValues, hoverPoint.x)
    : null;

  const newHoverValues: MeasureHoverValues = {
    totalDistanceMeters: derivedValues.totalDistanceMeters,
    distanceFromStartMeters,
    elevationMeters: elevationHoverData?.val ?? null,
    pathGradeDegrees: elevationHoverData?.slope ?? null,
    terrainSlopeDegrees: getGraphSlopeAtX(
      derivedValues.terrainSlopeGraphValues ?? [],
      hoverPoint.x
    ),
  };

  if (elevationHoverData) {
    //draw diamond
    const diamond = new paper.Path.Rectangle({
      point: new paper.Point(hoverPoint.x - 3, elevationHoverData.y - 3),
      size: 6,
      fillColor: paperStyles.green,
    });
    diamond.rotate(45);
    hoverGroup.addChild(diamond);
  }

  //draw bottom distance label
  const labelBackground = new paper.Path.Rectangle({
    point: new paper.Point(
      hoverPoint.x - 30,
      paperVars.terrainSlopeTop + paperVars.terrainSlopeHeight + 17
    ),
    size: new paper.Size(60, 20),
    fillColor: paperStyles.grey2,
  });
  hoverGroup.addChild(labelBackground);
  const distanceLabel = new paper.PointText({
    point: new paper.Point(
      hoverPoint.x,
      paperVars.terrainSlopeTop + paperVars.terrainSlopeHeight + 27
    ),
    justification: "center",
    fontFamily: measurePaperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: paperStyles.brightBlue,
    content: `${distanceFromStartMeters.toFixed(0)} m`,
  });
  hoverGroup.addChild(distanceLabel);

  setHoverValues(newHoverValues);

  dispatch(
    setMeasurementHover({
      measurementUuid: selectedMeasurementUuid,
      measurementPercentDistance: (hoverPoint.x - paperVars.drawingLeft) / paperVars.drawingWidth,
    })
  );
};

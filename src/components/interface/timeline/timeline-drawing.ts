import { MutableRefObject } from "react";
import { clearMapItemHover, setLeftPanelHoverUuid, setSequenceHover } from "store/hover";
import { padZeros } from "utils/formatting";
import paper from "paper";
import last from "lodash/last";
import orderBy from "lodash/orderBy";
import { Dispatch } from "@reduxjs/toolkit";
import { getHoverValue } from "utils/paper";

/**
 * Draws the vertical line wtih the rotated time at the bottom.
 * @param paperDataRef object containing all the paper data
 * @param xLoc optional x location of the time marker
 * @param customColor optional color to draw the line with
 * @param customTextColor optional color to draw the label with
 * @returns a paper group containing the line and time text
 */
export function drawTimeMarker(
  paperDataRef: MutableRefObject<PaperData>,
  xLoc: number,
  customColor: paper.Color = null,
  customTextColor: paper.Color = null
): paper.Group {
  const paperVars = paperDataRef.current.paperVars;
  const markerGroup = new paper.Group();
  const color = customColor || paperDataRef.current.styles.grey1;

  const verticalLine = new paper.Path.Line({
    from: new paper.Point(xLoc, paperVars.timelineTop),
    to: new paper.Point(xLoc, paperVars.timelineTop + paperVars.timelineHeight + 20),
    strokeColor: color,
    strokeWidth: 1,
  });
  verticalLine.name = "lineMarker";
  const seconds = Math.round((xLoc - paperVars.timelineLeft) * (1 / paperVars.pixelsPerSecondX));
  const timeMins = Math.floor((seconds % 3600) / 60);
  const timeHrs = Math.floor(seconds / 3600);
  const timeLabel = new paper.PointText({
    point: new paper.Point(xLoc - 30, paperVars.timelineTop + paperVars.timelineHeight + 40),
    justification: "left",
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: customTextColor || paperDataRef.current.styles.grey2,
    content: timeHrs + ":" + padZeros(timeMins, 2),
  });
  timeLabel.rotate(
    -45,
    new paper.Point(xLoc - 15, paperVars.timelineTop + paperVars.timelineHeight + 25)
  );
  markerGroup.addChildren([verticalLine, timeLabel]);
  return markerGroup;
}

/**
 * Draws the y axis meter ticks
 * @param paperDataRef object containing all the paper data
 * @param xLoc x location of the meter marker (for right or left y-axis)
 * @param yLoc y location of the meter marker
 * @param label label to display next to the meter marker
 * @param color
 * @param align alignment of the label and tickmark when drawn on on the right or left y-axis
 * @returns
 */
export function drawMeterMarker(
  fontFamily: string,
  xLoc: number,
  yLoc: number,
  label: string,
  color: paper.Color,
  align: "left" | "right"
): paper.Group {
  const markerGroup = new paper.Group();
  const horizontalLine = new paper.Path.Line({
    from: new paper.Point(xLoc + 10 * (align === "right" ? -1 : 1), yLoc),
    to: new paper.Point(xLoc, yLoc),
    strokeColor: color,
    strokeWidth: 1,
  });
  const meterLabel = new paper.PointText({
    point: new paper.Point(xLoc + 15 * (align === "right" ? -1 : 1), yLoc + 4),
    justification: align,
    fontFamily,
    fontSize: 12,
    fillColor: color,
    content: label,
  });
  markerGroup.addChildren([horizontalLine, meterLabel]);
  return markerGroup;
}

/**
 * Draws the graph axis, borders, and labels
 * @param paperDataRef
 * @param storeRef
 */
export function drawGraphAxis(
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>
): void {
  const paperVars = paperDataRef.current.paperVars;
  const axisGroup = new paper.Group();

  //draw top and bottom lines
  const topLine = new paper.Path.Line({
    from: new paper.Point(paperVars.timelineLeft, paperVars.timelineTop),
    to: new paper.Point(paperVars.timelineLeft + paperVars.timelineWidth, paperVars.timelineTop),
    strokeColor: paperDataRef.current.styles.grey1,
  });
  const bottomLine = new paper.Path.Line({
    from: new paper.Point(paperVars.timelineLeft, paperVars.sequenceTop - 4),
    to: new paper.Point(
      paperVars.timelineLeft + paperVars.timelineWidth,
      paperVars.sequenceTop - 4
    ),
    strokeColor: paperDataRef.current.styles.grey1,
  });
  axisGroup.addChildren([topLine, bottomLine]);

  //draw start and end lines for eva length
  drawTimeMarker(
    paperDataRef,
    paperVars.timelineLeft,
    paperDataRef.current.styles.white,
    paperDataRef.current.styles.white
  );
  if (Math.round(storeRef.current.evaLengthCalculatedMins) !== storeRef.current.evaLengthMins) {
    //draw the ending line
    let endingColor = paperDataRef.current.styles.white;
    if (Math.round(storeRef.current.evaLengthCalculatedMins) > storeRef.current.evaLengthMins) {
      endingColor = paperDataRef.current.styles.yellow;
    }
    drawTimeMarker(
      paperDataRef,
      paperVars.timelineLeft + storeRef.current.evaLengthMins * paperVars.pixelsPerSecondX * 60,
      endingColor,
      endingColor
    );
  }
  //draw PET label
  const petLabel = new paper.PointText({
    point: new paper.Point(
      paperVars.timelineLeft - 35,
      paperVars.timelineTop + paperVars.timelineHeight + 25
    ),
    justification: "left",
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: paperDataRef.current.styles.grey2,
    content: "PET",
  });
  axisGroup.addChild(petLabel);

  const markerSpacingPx = 25; //at least this many pixels between markers
  const possibleIntervalMeters = [
    1, 2, 5, 10, 15, 20, 25, 50, 100, 150, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
    200000, 500000, 1000000, 2000000, 5000000,
  ];

  //draw left y-axis - distance from lander

  //determine interval for distance from lander markers
  let distanceInterval = possibleIntervalMeters[0];
  for (let i = 0; i < possibleIntervalMeters.length; i++) {
    const numMarkers = storeRef.current.maxDistFromLanderMeters / possibleIntervalMeters[i];
    //determine how many can fit taking into account the marker spacing pixels
    if (numMarkers < paperVars.graphHeight / markerSpacingPx && i > 0) {
      distanceInterval = possibleIntervalMeters[i - 1];
      break;
    }
  }
  const useKmForDistanceFromLander = distanceInterval > 10000;

  //draw left y-axis label
  const leftYAxisLabelXOffset = 60;
  const leftYAxisLabel = new paper.PointText({
    point: new paper.Point(
      paperVars.timelineLeft - leftYAxisLabelXOffset,
      paperVars.timelineTop - 5
    ),
    justification: "right",
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: paperDataRef.current.styles.blue,
    content: `Distance from Lander ${useKmForDistanceFromLander ? "(km)" : "(m)"}`,
  });
  leftYAxisLabel.rotate(
    -90,
    new paper.Point(paperVars.timelineLeft - leftYAxisLabelXOffset, paperVars.timelineTop - 5)
  );
  axisGroup.addChild(leftYAxisLabel);

  //draw distance lander marker
  drawMeterMarker(
    paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    paperVars.timelineLeft,
    paperVars.timelineTop + paperVars.graphHeight,
    "Lander",
    paperDataRef.current.styles.blue,
    "right"
  );
  //draw distance markers above lander line
  const numMarkersAboveLander =
    paperVars.graphHeight / (distanceInterval * paperVars.pixelsPerMeterDistanceY);
  for (let i = 1; i < numMarkersAboveLander; i++) {
    const label = useKmForDistanceFromLander
      ? `${Math.round((i * distanceInterval) / 1000).toLocaleString("en-US")}`
      : `${Math.round(i * distanceInterval).toLocaleString("en-US")}`;
    drawMeterMarker(
      paperDataRef.current.styles.gNavigatorFontFamilyActivity,
      paperVars.timelineLeft,
      paperVars.timelineTop +
        paperVars.graphHeight -
        i * distanceInterval * paperVars.pixelsPerMeterDistanceY,
      label,
      paperDataRef.current.styles.blue,
      "right"
    );
  }

  //draw right y-axis - elevation
  //only draw if we have a lander elevation
  if (storeRef.current.landerElevationMeters) {
    const xLocRightYaxis = paperVars.timelineLeft + paperVars.timelineWidth;

    //determine interval for elevation markers
    let elevationInterval = possibleIntervalMeters[0];
    for (let i = 0; i < possibleIntervalMeters.length; i++) {
      const numMarkers =
        (storeRef.current.maxElevationMeters - storeRef.current.minElevationMeters) /
        possibleIntervalMeters[i];
      //determine how many can fit taking into account the marker spacing pixels
      if (numMarkers < paperVars.graphHeight / markerSpacingPx && i > 0) {
        elevationInterval = possibleIntervalMeters[i - 1];
        break;
      }
    }
    const useKmForElevation = elevationInterval > 10000;

    //draw right y-axis label
    const rightYAxisLabelXOffset = 65;
    const rightYAxisLabel = new paper.PointText({
      point: new paper.Point(
        paperVars.timelineLeft + paperVars.timelineWidth + rightYAxisLabelXOffset,
        paperVars.timelineTop - 5
      ),
      justification: "right",
      fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
      fontSize: 12,
      fillColor: paperDataRef.current.styles.green,
      content: `Relative Elevation ${useKmForElevation ? "(km)" : "(m)"}`,
    });
    rightYAxisLabel.rotate(
      -90,
      new paper.Point(
        paperVars.timelineLeft + paperVars.timelineWidth + rightYAxisLabelXOffset,
        paperVars.timelineTop - 5
      )
    );
    axisGroup.addChild(rightYAxisLabel);

    //right lander horizontal axis line and marker for lander
    drawMeterMarker(
      paperDataRef.current.styles.gNavigatorFontFamilyActivity,
      xLocRightYaxis,
      paperVars.timelineTop + paperVars.landerElevationFromGraphTop,
      `Lander`,
      paperDataRef.current.styles.green,
      "left"
    );
    const landerLine = new paper.Path.Line({
      from: new paper.Point(
        paperVars.timelineLeft + paperVars.timelineWidth,
        paperVars.timelineTop + paperVars.landerElevationFromGraphTop
      ),
      to: new paper.Point(
        paperVars.timelineLeft,
        paperVars.timelineTop + paperVars.landerElevationFromGraphTop
      ),
      strokeColor: paperDataRef.current.styles.green,
    });
    axisGroup.addChild(landerLine);

    //draw elevation markers
    const elevationIntervalInPixels = elevationInterval * paperVars.pixelsPerMeterElevationY;
    const yLocLanderElevation = paperVars.timelineTop + paperVars.landerElevationFromGraphTop;
    let markerArea: number;
    let numMarkers: number;

    //draw markers below lander
    markerArea = paperVars.graphHeight - paperVars.landerElevationFromGraphTop;
    numMarkers = markerArea / elevationIntervalInPixels;
    for (let i = 1; i < numMarkers; i++) {
      const label = useKmForElevation
        ? `-${Math.round((i * elevationInterval) / 1000).toLocaleString("en-US")}`
        : `-${Math.round(i * elevationInterval).toLocaleString("en-US")}`;
      drawMeterMarker(
        paperDataRef.current.styles.gNavigatorFontFamilyActivity,
        xLocRightYaxis,
        yLocLanderElevation + elevationIntervalInPixels * i,
        label,
        paperDataRef.current.styles.green,
        "left"
      );
    }

    //draw markers above lander
    markerArea = paperVars.landerElevationFromGraphTop;
    numMarkers = markerArea / elevationIntervalInPixels;
    for (let i = 1; i < numMarkers; i++) {
      const label = useKmForElevation
        ? `${Math.round((i * elevationInterval) / 1000).toLocaleString("en-US")}`
        : `${Math.round(i * elevationInterval).toLocaleString("en-US")}`;
      drawMeterMarker(
        paperDataRef.current.styles.gNavigatorFontFamilyActivity,
        xLocRightYaxis,
        yLocLanderElevation - elevationIntervalInPixels * i,
        label,
        paperDataRef.current.styles.green,
        "left"
      );
    }
  }
}

/**
 * Draws the distance from lander line graph, and also the walk back if it's a station
 * @param paperDataRef
 * @param graphItems
 */
export function drawLanderDistanceGraph(
  paperDataRef: MutableRefObject<PaperData>,
  graphItems: MutableRefObject<GraphSequenceItems>
): void {
  const paperVars = paperDataRef.current.paperVars;
  const landerDistanceGroup = new paper.Group();

  //loop through the sequence items
  for (const graphItem in graphItems.current) {
    const strokePoints: number[][] = [];
    //loop through the distance from lander coordinates
    for (const graphData of graphItems.current[graphItem].distanceFromLanderXY) {
      strokePoints.push([graphData.xPixel, graphData.yPixel]); //push stroke point
    }
    const distanceFromLanderStrokePath = new paper.Path(strokePoints);
    distanceFromLanderStrokePath.strokeColor = paperDataRef.current.styles.blue;
    distanceFromLanderStrokePath.opacity = 1;
    distanceFromLanderStrokePath.strokeWidth = 1.5;
  }

  //draw first and last dots on the distance graph
  const diamond = new paper.Path.Rectangle({
    point: new paper.Point(
      paperVars.timelineLeft - 3,
      paperVars.timelineTop + paperVars.graphHeight - 3
    ),
    size: 6,
    fillColor: paperDataRef.current.styles.blue,
  });
  diamond.rotate(45);
  landerDistanceGroup.addChild(diamond);

  const diamond2 = new paper.Path.Rectangle({
    point: new paper.Point(
      paperVars.timelineLeft + paperVars.timelineWidth - 3,
      paperVars.timelineTop + paperVars.graphHeight - 3
    ),
    size: 6,
    fillColor: paperDataRef.current.styles.blue,
  });
  diamond2.rotate(45);
  landerDistanceGroup.addChild(diamond2);
}

/**
 * Draws the elevation profile graph.
 * Elevation profile is given in a 2d GraphData array.
 * The first dimension represents the sequence items
 * @param paperDataRef
 * @param graphItems
 */
export function drawElevationProfile(
  paperDataRef: MutableRefObject<PaperData>,
  graphItems: MutableRefObject<GraphSequenceItems>
): void {
  const paperVars = paperDataRef.current.paperVars;
  const yLanderPixel = paperVars.timelineTop + paperVars.landerElevationFromGraphTop;

  // loop through the sequence items
  for (const sequenceItemUuid in graphItems.current) {
    //build points for each sequence and draw
    const fillPoints: number[][] = [];
    const strokePoints: number[][] = [];

    const graphDataItems = graphItems.current[sequenceItemUuid].elevationXY;
    if (!graphDataItems || graphDataItems.length === 0) continue;

    fillPoints.push([graphDataItems[0].xPixel, yLanderPixel]);
    for (const graphDataItem of graphDataItems) {
      fillPoints.push([graphDataItem.xPixel, graphDataItem.yPixel]);
      strokePoints.push([graphDataItem.xPixel, graphDataItem.yPixel]);
    }
    fillPoints.push([graphDataItems.at(-1).xPixel, yLanderPixel]);

    const elevationFillPath = new paper.Path(fillPoints);
    elevationFillPath.fillColor = paperDataRef.current.styles.green;
    elevationFillPath.opacity = 0.1;

    //build points for the stroke path and draw
    const elevationStrokePath = new paper.Path(strokePoints);
    elevationStrokePath.strokeColor = paperDataRef.current.styles.green;
    elevationStrokePath.opacity = 1;
    elevationStrokePath.strokeWidth = 1.5;
  }

  //draw first and last dots on the elevation graph
  const diamond = new paper.Path.Rectangle({
    point: new paper.Point(
      paperVars.timelineLeft - 3,
      paperVars.timelineTop + paperVars.landerElevationFromGraphTop - 3
    ),
    size: 6,
    fillColor: paperDataRef.current.styles.green,
  });
  diamond.rotate(45);

  const diamond2 = new paper.Path.Rectangle({
    point: new paper.Point(
      paperVars.timelineLeft + paperVars.timelineWidth - 3,
      paperVars.timelineTop + paperVars.landerElevationFromGraphTop - 3
    ),
    size: 6,
    fillColor: paperDataRef.current.styles.green,
  });
  diamond2.rotate(45);
}

/**
 * Draws the walkback path for the EVA.
 * @param paperDataRef
 * @param graphItems
 * @param selectedEvaSequenceItemUuid
 */
export function drawWalkbacks(
  paperDataRef: MutableRefObject<PaperData>,
  graphItems: MutableRefObject<GraphSequenceItems>,
  selectedEvaSequenceItemUuid: string
): void {
  for (const sequenceItemUuid in graphItems.current) {
    const graphDataItems = graphItems.current[sequenceItemUuid].walkbackDistanceFromLanderXY;
    if (!graphDataItems || graphDataItems.length === 0) continue;
    if (sequenceItemUuid !== selectedEvaSequenceItemUuid) continue;

    const pointArray = graphItems.current[sequenceItemUuid].walkbackDistanceFromLanderXY.map(
      (graphData) => [graphData.xPixel, graphData.yPixel]
    );
    const walkbackLine = new paper.Path(pointArray);
    walkbackLine.strokeColor = paperDataRef.current.styles.blue;
    walkbackLine.strokeWidth = 1.5;
    walkbackLine.dashArray = [5, 2];
  }
}

/**
 * Draws the walkback elevations
 * @param paperDataRef
 * @param graphItems
 * @param selectedEvaSequenceItemUuid
 */
export function drawWalkbackElevations(
  paperDataRef: MutableRefObject<PaperData>,
  graphItems: MutableRefObject<GraphSequenceItems>,
  selectedEvaSequenceItemUuid: string
): void {
  const paperVars = paperDataRef.current.paperVars;
  const yLanderPixel = paperVars.timelineTop + paperVars.landerElevationFromGraphTop;

  for (const sequenceItemUuid in graphItems.current) {
    const fillPoints: number[][] = [];
    const strokePoints: number[][] = [];

    const graphDataItems = graphItems.current[sequenceItemUuid].walkbackElevationXY;
    if (!graphDataItems || graphDataItems.length === 0) continue;
    if (sequenceItemUuid !== selectedEvaSequenceItemUuid) continue;

    fillPoints.push([graphDataItems[0].xPixel, yLanderPixel]);
    for (const graphDataItem of graphDataItems) {
      fillPoints.push([graphDataItem.xPixel, graphDataItem.yPixel]);
      strokePoints.push([graphDataItem.xPixel, graphDataItem.yPixel]);
    }
    fillPoints.push([graphDataItems.at(-1).xPixel, yLanderPixel]);

    const walkbackElevationLine = new paper.Path(strokePoints);
    walkbackElevationLine.strokeColor = paperDataRef.current.styles.green;
    walkbackElevationLine.strokeWidth = 1.5;
    walkbackElevationLine.dashArray = [5, 2];

    const walkbackElevationFillPath = new paper.Path(fillPoints);
    walkbackElevationFillPath.fillColor = paperDataRef.current.styles.green;
    walkbackElevationFillPath.opacity = 0.1;
  }
}

/**
 * Draws the EVA sequence - station boxes, traverses, and vertical time markers
 *  Sequence items are drawn rounded to their nearest minute
 * @param paperDataRef
 * @param paperGroupsRef
 * @param storeRef
 * @param selectedEvaSequenceItemUuid
 */
export function drawSequenceBottomSection(
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>,
  selectedEvaSequenceItemUuid: string
): void {
  const paperVars = paperDataRef.current.paperVars;

  let xLoc: number = paperVars.timelineLeft; //running x pixel
  let xLocRounded: number = paperVars.timelineLeft; //rounded running x pixel
  let minutes = 0; //running cumulative time
  for (let i = 0; i < storeRef.current.sequenceItems.length; i++) {
    const sequenceItem = storeRef.current.sequenceItems[i];

    const itemWidth = paperVars.pixelsPerSecondX * sequenceItem.totalDurationMins * 60;
    minutes += sequenceItem.totalDurationMins;
    const endXLocRounded =
      paperVars.timelineLeft + Math.round(minutes) * 60 * paperVars.pixelsPerSecondX; //ending x coordinate of the item

    if (sequenceItem.type === "station") {
      drawSequenceStation(
        paperDataRef,
        xLocRounded,
        endXLocRounded,
        selectedEvaSequenceItemUuid === sequenceItem.uuid
          ? paperDataRef.current.styles.yellow
          : paperDataRef.current.styles.grey2,
        sequenceItem.name
      );
    } else if (sequenceItem.type === "traverse") {
      drawSequenceTraverse(
        paperDataRef,
        xLocRounded,
        endXLocRounded,
        selectedEvaSequenceItemUuid === sequenceItem.uuid
          ? paperDataRef.current.styles.yellow
          : paperDataRef.current.styles.grey2
      );
    }

    //draw background rectangle (that turns yellow when selected) and add it to the paper refs
    const bkgColor =
      selectedEvaSequenceItemUuid === sequenceItem.uuid
        ? paperDataRef.current.styles.lightYellow
        : paperDataRef.current.styles.grey4;
    const bkgRect = new paper.Path.Rectangle({
      rectangle: new paper.Rectangle(
        new paper.Point(xLocRounded + 1, paperVars.timelineTop + 1),
        new paper.Point(endXLocRounded - 1, paperVars.sequenceTop - 5)
      ),
      fillColor: bkgColor,
      name: sequenceItem.uuid,
    });
    paperGroupsRef.current.graphBkg.addChild(bkgRect);

    //draw sequence item ending time marker
    let textColor: paper.Color = paperDataRef.current.styles.grey2;
    let lineColor: paper.Color = paperDataRef.current.styles.grey1;
    //highlight this ending time marker if the next sequence item is selected so the start time marker of the selected sequence is highlighted
    if (
      (i < storeRef.current.sequenceItems.length - 1 &&
        storeRef.current.sequenceItems[i + 1].uuid === selectedEvaSequenceItemUuid) ||
      selectedEvaSequenceItemUuid === sequenceItem.uuid
    ) {
      textColor = paperDataRef.current.styles.yellow;
      lineColor = paperDataRef.current.styles.yellow;
    } else if (i === storeRef.current.sequenceItems.length - 1) {
      //the color of the time marker at the end of the EVA sequence
      lineColor = paperDataRef.current.styles.white;
    }
    const timeMarkerEnd = drawTimeMarker(paperDataRef, endXLocRounded, lineColor, textColor);
    timeMarkerEnd.name = sequenceItem.uuid;

    //move x location
    xLocRounded = endXLocRounded;
    xLoc += itemWidth; //always holds the true x location and width
  }

  //draw "Available" at the end of the sequence
  if (Math.round(storeRef.current.evaLengthCalculatedMins) < storeRef.current.evaLengthMins) {
    if (Math.round(xLoc) < paperVars.timelineLeft + paperVars.timelineWidth) {
      const availableMiddleX = (xLoc + paperVars.timelineLeft + paperVars.timelineWidth) / 2;
      const seconds =
        (paperVars.timelineLeft + paperVars.timelineWidth - xLoc) *
        (1 / paperVars.pixelsPerSecondX);
      const timeHrs = Math.floor(seconds / 3600);
      const timeMins = Math.round((seconds % 3600) / 60);
      const availableLabel = new paper.PointText({
        point: new paper.Point(availableMiddleX, paperVars.sequenceTop + 14),
        justification: "center",
        content: "Available (" + timeHrs + ":" + padZeros(timeMins, 2) + ")",
        fillColor: paperDataRef.current.styles.grey2,
        name: "availableLabel",
      });
      const group = new paper.Group();
      group.addChild(availableLabel);
    }
  }
}

/**
 * Draw a station box on the bottom sequence
 * @param paperDataRef
 * @param xStart
 * @param xEnd
 * @param color
 * @param stationName
 */
function drawSequenceStation(
  paperDataRef: MutableRefObject<PaperData>,
  xStart: number,
  xEnd: number,
  color: paper.Color,
  stationName: string
): void {
  const sequenceItemGroup = new paper.Group();
  const paperVars = paperDataRef.current.paperVars;

  const stationBox = new paper.Rectangle(
    new paper.Point(xStart, paperVars.sequenceTop),
    new paper.Point(xEnd, paperVars.sequenceTop + paperVars.sequenceHeight)
  );
  const stationBoxRounded = new paper.Path.Rectangle({
    rectangle: stationBox,
    radius: new paper.Size(5, 5),
    strokeColor: color,
    strokeWidth: 1.5,
  });

  //draw label
  const itemWidthRounded = xEnd - xStart;
  const stationMiddleX = xStart + itemWidthRounded / 2;
  //abbreviate station name if too long
  if (itemWidthRounded < 60 && itemWidthRounded > 30) {
    stationName = `${stationName.substring(0, 2)}...`;
  } else if (itemWidthRounded < 30) {
    stationName = `${stationName.substring(0, 1)}..`;
  }
  const label = new paper.PointText({
    point: new paper.Point(stationMiddleX, paperVars.sequenceTop + 14),
    justification: "center",
    content: stationName,
    fillColor: color,
  });
  //clip mask for station box
  const clipRectangle = new paper.Path.Rectangle(
    new paper.Point(xStart - 1, paperVars.sequenceTop - 1),
    new paper.Point(xEnd + 1, paperVars.sequenceTop + paperVars.sequenceHeight + 1)
  );

  sequenceItemGroup.addChildren([clipRectangle, stationBoxRounded, label]);
  sequenceItemGroup.clipped = true;
}

/**
 * Draw traverse dotted line on the bottom sequence
 * @param paperDataRef
 * @param xStart
 * @param xEnd
 * @param color
 */
function drawSequenceTraverse(
  paperDataRef: MutableRefObject<PaperData>,
  xStart: number,
  xEnd: number,
  color: paper.Color
): void {
  const sequenceItemGroup = new paper.Group();
  const paperVars = paperDataRef.current.paperVars;

  const traverseLine = new paper.Path.Line({
    from: new paper.Point(xStart, paperVars.sequenceTop + 10),
    to: new paper.Point(xEnd, paperVars.sequenceTop + 10),
    strokeColor: color,
    strokeWidth: 1.5,
    dashArray: [5, 2],
  });
  sequenceItemGroup.addChild(traverseLine);
}

/**
 * Draw the pet line for rex
 * @param paperDataRef
 * @param paperGroupsRef
 * @param petSeconds
 */
export const drawPetLine = (
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  petSeconds: number
): void => {
  const paperVars = paperDataRef.current.paperVars;
  const xLoc = paperVars.timelineLeft + petSeconds * paperVars.pixelsPerSecondX;
  //remove old line, draw new line
  paperGroupsRef.current.petLine.removeChildren();
  if (xLoc <= paperVars.timelineLeft + paperVars.timelineWidth) {
    paperGroupsRef.current.petLine.addChild(
      drawTimeMarker(
        paperDataRef,
        xLoc,
        paperDataRef.current.styles.brightGreen,
        paperDataRef.current.styles.brightGreen
      )
    );
    paperGroupsRef.current.petLine.bringToFront();
    paperGroupsRef.current.petLine.visible = true;
  }
};

/**
 * Draw crew positions for the REX event
 * @param paperDataRef
 * @param paperGroupsRef
 */
export const drawPositionMarkers = (
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  posRef: MutableRefObject<PosEntry_PaperJS[]>,
  selectedPosEntryUuid: string
): void => {
  const paperVars = paperDataRef.current.paperVars;
  const posRefSorted = orderBy(posRef.current, ["seconds"], "desc");
  for (let i = 0; i < posRefSorted.length; i++) {
    const posPaperJS = posRefSorted[i];
    const x = posPaperJS.seconds * paperVars.pixelsPerSecondX + paperVars.timelineLeft;
    const y =
      paperVars.timelineTop +
      paperVars.graphHeight -
      posPaperJS.distanceFromLanderMeters * paperVars.pixelsPerMeterDistanceY;
    let color = paperDataRef.current.styles.blue;
    if (selectedPosEntryUuid === posRefSorted[i].uuid) {
      color = paperDataRef.current.styles.yellow;
    } else if (i === 0) {
      color = paperDataRef.current.styles.brightGreen;
    }
    const circle = new paper.Path.Circle(new paper.Point(x, y), 3);
    circle.fillColor = color;
    circle.name = posRefSorted[i].uuid;
    paperGroupsRef.current.positionMarkers.addChild(circle);
  }
};

/**
 * Draw the mouse hover line. Also dispatch information about where the
 * mouse is to the store
 * @param dispatch
 * @param paperDataRef
 * @param paperGroupsRef
 * @param storeRef
 * @param flattenedGraphData
 * @param xLoc
 * @param setHoverValues
 * @param landerElevationMeters
 * @returns
 */
export const drawMouseHover = (
  dispatch: Dispatch,
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>,
  flattenedGraphData: MutableRefObject<GraphData>,
  hoverPoint: paper.Point,
  setHoverValues: Function,
  landerElevationMeters: number
): void => {
  //check if we're inside the bounds of the graph
  const paperVars = paperDataRef.current.paperVars;
  if (
    hoverPoint.x > paperVars.timelineLeft &&
    hoverPoint.x < paperVars.timelineLeft + paperVars.timelineWidth &&
    hoverPoint.y > paperVars.timelineTop &&
    hoverPoint.y < paperVars.timelineTop + paperVars.timelineHeight
  ) {
    //remove old line, draw new line
    paperGroupsRef.current.hoverLine.removeChildren();
    paperGroupsRef.current.hoverLine.addChild(
      drawTimeMarker(
        paperDataRef,
        hoverPoint.x,
        paperDataRef.current.styles.brightBlue,
        paperDataRef.current.styles.brightBlue
      )
    );
    paperGroupsRef.current.hoverLine.addChild(
      new paper.Path.Line({
        from: new paper.Point(paperVars.timelineLeft - 10, hoverPoint.y),
        to: new paper.Point(paperVars.timelineLeft + paperVars.timelineWidth + 10, hoverPoint.y),
        strokeColor: paperDataRef.current.styles.brightBlue,
        strokeWidth: 1,
      })
    );
    paperGroupsRef.current.hoverLine.bringToFront();
    paperGroupsRef.current.hoverLine.visible = true;

    //calculate hover seconds
    const seconds = (hoverPoint.x - paperVars.timelineLeft) / paperVars.pixelsPerSecondX;

    //determine sequence item
    let sequenceUuid = null;
    let sequenceType = null;
    let sequenceItemPercentElapsed = null;
    for (const bkgBlock of paperGroupsRef.current.graphBkg.children) {
      if (bkgBlock.contains(new paper.Point(hoverPoint.x, paperVars.timelineTop + 1))) {
        //add 1 so the y point would be inside the block
        sequenceUuid = bkgBlock.name;
        const sequenceItem = storeRef.current.sequenceItems.find(
          (seqItem) => seqItem.uuid === bkgBlock.name
        );
        sequenceType = sequenceItem.type;
        sequenceItemPercentElapsed =
          (seconds - sequenceItem.secondsStart) / (sequenceItem.totalDurationMins * 60);
        break;
      }
    }

    //get hover values and draw diamonds
    const newHoverValues: TimelineHoverValues = {
      distanceFromLanderMeters: null,
      elevationMeters: null,
      slopeDegrees: null,
      walkbackDistanceFromLanderMeters: null,
      walkbackElevationMeters: null,
      walkbackSlopeDegrees: null,
    };

    // find the GraphDataItem of the distanceFromLander with the closest x value compared to xLoc
    if (flattenedGraphData.current.distanceFromLanderXY?.length > 0) {
      const hoverData = getHoverValue(
        flattenedGraphData.current.distanceFromLanderXY,
        hoverPoint.x
      );
      newHoverValues.distanceFromLanderMeters = hoverData.val;
      const diamond = new paper.Path.Rectangle({
        point: new paper.Point(hoverPoint.x - 3, hoverData.y - 3),
        size: 6,
        fillColor: paperDataRef.current.styles.blue,
      });
      diamond.rotate(45);
      paperGroupsRef.current.hoverLine.addChild(diamond);
    }

    // find the GraphDataItem of the elevation with the closest x value compared to xLoc
    if (flattenedGraphData.current.elevationXY?.length > 0) {
      const hoverData = getHoverValue(flattenedGraphData.current.elevationXY, hoverPoint.x);
      newHoverValues.elevationMeters = hoverData.val - landerElevationMeters;
      newHoverValues.slopeDegrees = hoverData.slope;
      const diamond = new paper.Path.Rectangle({
        point: new paper.Point(hoverPoint.x - 3, hoverData.y - 3),
        size: 6,
        fillColor: paperDataRef.current.styles.green,
      });
      diamond.rotate(45);
      paperGroupsRef.current.hoverLine.addChild(diamond);
    }

    // find the GraphDataItem of the walkbackDistanceFromLander with the closest x value compared to xLoc
    if (flattenedGraphData.current.walkbackDistanceFromLanderXY?.length > 0) {
      //check we're in x range for this walkback elevation
      const firstPoint = flattenedGraphData.current.walkbackDistanceFromLanderXY[0];
      const lastPoint = last(flattenedGraphData.current.walkbackDistanceFromLanderXY);
      if (hoverPoint.x < firstPoint.xPixel || hoverPoint.x > lastPoint.xPixel) {
        newHoverValues.walkbackDistanceFromLanderMeters = null;
      } else {
        const hoverData = getHoverValue(
          flattenedGraphData.current.walkbackDistanceFromLanderXY,
          hoverPoint.x
        );
        newHoverValues.walkbackDistanceFromLanderMeters = hoverData.val;
        const diamond = new paper.Path.Rectangle({
          point: new paper.Point(hoverPoint.x - 3, hoverData.y - 3),
          size: 6,
        });
        diamond.rotate(45);
        diamond.strokeColor = paperDataRef.current.styles.blue;
        diamond.dashArray = [5, 2];
        paperGroupsRef.current.hoverLine.addChild(diamond);
      }
    } else {
      newHoverValues.walkbackDistanceFromLanderMeters = null;
    }

    // find the GraphDataItem of the walkbackElevationXY with the closest x value compared to xLoc
    if (flattenedGraphData.current.walkbackElevationXY?.length > 0) {
      //check we're in x range for this walkback elevation
      const firstPoint = flattenedGraphData.current.walkbackElevationXY[0];
      const lastPoint = last(flattenedGraphData.current.walkbackElevationXY);
      if (hoverPoint.x < firstPoint.xPixel || hoverPoint.x > lastPoint.xPixel) {
        newHoverValues.walkbackElevationMeters = null;
      } else {
        const hoverData = getHoverValue(
          flattenedGraphData.current.walkbackElevationXY,
          hoverPoint.x
        );
        newHoverValues.walkbackElevationMeters = hoverData.val - landerElevationMeters;
        newHoverValues.walkbackSlopeDegrees = hoverData.slope;
        const diamond = new paper.Path.Rectangle({
          point: new paper.Point(hoverPoint.x - 3, hoverData.y - 3),
          size: 6,
        });
        diamond.rotate(45);
        diamond.strokeColor = paperDataRef.current.styles.green;
        diamond.dashArray = [5, 2];
        paperGroupsRef.current.hoverLine.addChild(diamond);
      }
    } else {
      newHoverValues.walkbackElevationMeters = null;
    }

    // set the hover values for display to the left of the timeline
    setHoverValues(newHoverValues);

    //save hover data to store
    dispatch(setLeftPanelHoverUuid(sequenceUuid));
    dispatch(
      setSequenceHover({ sequenceUuid, sequenceItemPercentElapsed, mapItemType: sequenceType })
    );
  } else {
    //mouse is outside of the graph area but is still inside paper canvas
    paperGroupsRef.current.hoverLine.visible = false;
    dispatch(setLeftPanelHoverUuid(null));
    dispatch(clearMapItemHover());
  }
};

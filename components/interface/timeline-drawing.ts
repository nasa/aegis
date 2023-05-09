import { Dispatch, MutableRefObject } from "react";
import { clearMapItemHover, setLeftPanelHoverUuid, setMapItemHover } from "store/playheadHover";
import { padZeros } from "utils/formatting";
import { AnyAction } from "@reduxjs/toolkit";
import paper from "paper";
import { getSlope } from "utils/geoMath";

/**
 * Draws the vertical line wtih the rotated time at the bottom.
 * @param paperDataRef object containing all the paper data
 * @param xLoc x location of the time marker
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
  const color = customColor || paperDataRef.current.styles.gray1;
  const verticalLine = new paper.Path.Line({
    from: new paper.Point(xLoc, paperVars.timelineTop),
    to: new paper.Point(xLoc, paperVars.timelineTop + paperVars.timelineHeight + 20),
    strokeColor: color,
    strokeWidth: 1,
  });
  verticalLine.name = "lineMarker";
  const seconds = Math.round((xLoc - paperVars.timelineLeft) * (1 / paperVars.pixelsPerSecondX));
  const timeHrs = Math.floor(seconds / 3600);
  const timeMins = Math.round((seconds % 3600) / 60);
  const timeLabel = new paper.PointText({
    point: new paper.Point(xLoc - 30, paperVars.timelineTop + paperVars.timelineHeight + 40),
    justification: "left",
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: customTextColor || paperDataRef.current.styles.gray2,
    content: timeHrs + ":" + padZeros(timeMins, 2),
  });
  timeLabel.rotate(
    -45,
    new paper.Point(xLoc - 15, paperVars.timelineTop + paperVars.timelineHeight + 25)
  );
  markerGroup.addChildren([timeLabel, verticalLine]);
  return markerGroup;
}

/**
 * Draws the y axis meter ticks
 * @param paperDataRef object containing all the paper data
 * @param xLoc x location of the meter marker (for right or left y-axis)
 * @param yLoc y location of the meter marker
 * @param label label to display next to the meter marker
 * @param align alignment of the label and tickmark when drawn on on the right or left y-axis
 * @returns
 */
export function drawMeterMarker(
  paperDataRef: MutableRefObject<PaperData>,
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
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
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
 * @param paperGroupsRef
 * @param storeRef
 */
export function drawGraphAxis(
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<StoreData_PaperJS>
): void {
  const paperVars = paperDataRef.current.paperVars;
  const axisGroup = new paper.Group();

  //draw top and bottom lines
  const topLine = new paper.Path.Line({
    from: new paper.Point(paperVars.timelineLeft, paperVars.timelineTop),
    to: new paper.Point(paperVars.timelineLeft + paperVars.timeineWidth, paperVars.timelineTop),
    strokeColor: paperDataRef.current.styles.gray1,
  });
  const bottomLine = new paper.Path.Line({
    from: new paper.Point(paperVars.timelineLeft, paperVars.sequenceTop - 4),
    to: new paper.Point(paperVars.timelineLeft + paperVars.timeineWidth, paperVars.sequenceTop - 4),
    strokeColor: paperDataRef.current.styles.gray1,
  });
  axisGroup.addChildren([topLine, bottomLine]);

  //draw start and end lines for eva length
  drawTimeMarker(
    paperDataRef,
    paperVars.timelineLeft,
    paperDataRef.current.styles.white,
    paperDataRef.current.styles.white
  );
  let endingColor = paperDataRef.current.styles.white;
  if (storeRef.current.evaLengthCalculatedMins > storeRef.current.evaLengthMins)
    endingColor = paperDataRef.current.styles.red;
  drawTimeMarker(
    paperDataRef,
    paperVars.timelineLeft + storeRef.current.evaLengthMins * paperVars.pixelsPerSecondX * 60,
    endingColor,
    endingColor
  );

  //draw PET label
  const petLabel = new paper.PointText({
    point: new paper.Point(
      paperVars.timelineLeft - 35,
      paperVars.timelineTop + paperVars.timelineHeight + 25
    ),
    justification: "left",
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: paperDataRef.current.styles.gray2,
    content: "PET",
  });
  axisGroup.addChild(petLabel);

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
    content: "Distance from Lander (m)",
  });
  leftYAxisLabel.rotate(
    -90,
    new paper.Point(paperVars.timelineLeft - leftYAxisLabelXOffset, paperVars.timelineTop - 5)
  );
  axisGroup.addChild(leftYAxisLabel);

  //draw right y-axis label
  const rightYAxisLabelXOffset = 65;
  const rightYAxisLabel = new paper.PointText({
    point: new paper.Point(
      paperVars.timelineLeft + paperVars.timeineWidth + rightYAxisLabelXOffset,
      paperVars.timelineTop - 5
    ),
    justification: "right",
    fontFamily: paperDataRef.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: paperDataRef.current.styles.green,
    content: "Relative Elevation (m)",
  });
  rightYAxisLabel.rotate(
    -90,
    new paper.Point(
      paperVars.timelineLeft + paperVars.timeineWidth + rightYAxisLabelXOffset,
      paperVars.timelineTop - 5
    )
  );
  axisGroup.addChild(rightYAxisLabel);

  //draw left y-axis meters
  const markerSpacingPx = 20; //20px = spacing for markers
  //max meters
  drawMeterMarker(
    paperDataRef,
    paperVars.timelineLeft,
    paperVars.timelineTop,
    `${Math.round(storeRef.current.maxDistFromLanderMeters).toLocaleString("en-US")}`,
    paperDataRef.current.styles.blue,
    "right"
  );
  // min meter (at 0)
  drawMeterMarker(
    paperDataRef,
    paperVars.timelineLeft,
    paperVars.timelineTop + paperVars.graphHeight,
    "Lander",
    paperDataRef.current.styles.blue,
    "right"
  );
  //inbetween meter lines
  const numDistanceMarkers = Math.floor(paperVars.graphHeight / markerSpacingPx);
  const metersBtwnDistanceMarkers = storeRef.current.maxDistFromLanderMeters / numDistanceMarkers;
  for (let i = 1; i < numDistanceMarkers; i++) {
    drawMeterMarker(
      paperDataRef,
      paperVars.timelineLeft,
      paperVars.timelineTop + metersBtwnDistanceMarkers * i * paperVars.pixelsPerMeterDistanceY,
      `${Math.round(
        storeRef.current.maxDistFromLanderMeters - metersBtwnDistanceMarkers * i
      ).toLocaleString("en-US")}`,
      paperDataRef.current.styles.blue,
      "right"
    );
  }

  //draw right y-axis meters
  const xLocRightYaxis = paperVars.timelineLeft + paperVars.timeineWidth;
  const spacingFromLanderMaker = markerSpacingPx * 0.8; //how close are we allow other markers to come close to the lander marker
  let elevationFromLander: number;

  //lander meter and horizontal axis
  if (storeRef.current.landerElevationMeters) {
    drawMeterMarker(
      paperDataRef,
      xLocRightYaxis,
      paperVars.timelineTop + paperVars.landerElevationFromGraphTop,
      `Lander`,
      paperDataRef.current.styles.green,
      "left"
    );
    const landerLine = new paper.Path.Line({
      from: new paper.Point(
        paperVars.timelineLeft + paperVars.timeineWidth,
        paperVars.timelineTop + paperVars.landerElevationFromGraphTop
      ),
      to: new paper.Point(
        paperVars.timelineLeft,
        paperVars.timelineTop + paperVars.landerElevationFromGraphTop
      ),
      strokeColor: paperDataRef.current.styles.green,
    });
    axisGroup.addChild(landerLine);

    //max meters
    elevationFromLander =
      storeRef.current.maxElevationMeters - storeRef.current.landerElevationMeters;
    if (paperVars.landerElevationFromGraphTop > spacingFromLanderMaker) {
      drawMeterMarker(
        paperDataRef,
        xLocRightYaxis,
        paperVars.timelineTop,
        `${Math.round(elevationFromLander).toLocaleString("en-US")}`,
        paperDataRef.current.styles.green,
        "left"
      );
    }
    //min meters
    elevationFromLander =
      storeRef.current.landerElevationMeters - storeRef.current.minElevationMeters;
    if (paperVars.graphHeight - paperVars.landerElevationFromGraphTop > spacingFromLanderMaker) {
      drawMeterMarker(
        paperDataRef,
        xLocRightYaxis,
        paperVars.timelineTop + paperVars.graphHeight,
        `${
          storeRef.current.minElevationMeters < storeRef.current.landerElevationMeters ? "-" : ""
        }${Math.round(elevationFromLander).toLocaleString("en-US")}`,
        paperDataRef.current.styles.green,
        "left"
      ); // min meter
    }
    //inbetween meter lines
    const numElevationMarkers = Math.floor(paperVars.graphHeight / markerSpacingPx);
    const metersBtwnElevationMarkers =
      (storeRef.current.maxElevationMeters - storeRef.current.minElevationMeters) /
      numElevationMarkers;
    for (let i = 1; i < numElevationMarkers; i++) {
      const realLanderElevation = storeRef.current.landerElevationMeters;
      const realLabelElevation =
        storeRef.current.maxElevationMeters - metersBtwnElevationMarkers * i;
      elevationFromLander = Math.abs(realLanderElevation - realLabelElevation);
      const pixelsFromLanderMarker = elevationFromLander * paperVars.pixelsPerMeterElevationY;
      if (pixelsFromLanderMarker > spacingFromLanderMaker) {
        drawMeterMarker(
          paperDataRef,
          xLocRightYaxis,
          paperVars.timelineTop +
            metersBtwnElevationMarkers * i * paperVars.pixelsPerMeterElevationY,
          `${realLanderElevation > realLabelElevation ? "-" : ""}${Math.round(
            elevationFromLander
          ).toLocaleString("en-US")}`,
          paperDataRef.current.styles.green,
          "left"
        );
      }
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

  //draw graph
  const yZeroPixel = paperVars.timelineTop + paperVars.graphHeight;
  for (const graphItem in graphItems.current) {
    const fillPoints: number[][] = [];
    const strokePoints: number[][] = [];
    for (const [graphDataIndex, graphData] of graphItems.current[
      graphItem
    ].distanceFromLanderXY.entries()) {
      //push stroke point
      strokePoints.push([graphData.xPixel, graphData.yPixel]);

      //push fill point
      if (graphDataIndex === 0) fillPoints.push([graphData.xPixel, yZeroPixel]);
      fillPoints.push([graphData.xPixel, graphData.yPixel]);
      if (graphDataIndex === graphItems.current[graphItem].distanceFromLanderXY.length - 1)
        fillPoints.push([graphData.xPixel, yZeroPixel]);
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
      paperVars.timelineLeft + paperVars.timeineWidth - 3,
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
      paperVars.timelineLeft + paperVars.timeineWidth - 3,
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
    const graphDataItems = graphItems.current[sequenceItemUuid].walkbackXY;
    if (!graphDataItems || graphDataItems.length === 0) continue;
    if (sequenceItemUuid !== selectedEvaSequenceItemUuid) continue;

    const pointArray = graphItems.current[sequenceItemUuid].walkbackXY.map((graphData) => [
      graphData.xPixel,
      graphData.yPixel,
    ]);
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
 * @param paperDataRef
 * @param paperGroupsRef
 * @param storeRef
 * @param selectedEvaSequenceItemUuid
 */
export function drawSequenceBottomSection(
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<StoreData_PaperJS>,
  selectedEvaSequenceItemUuid: string
): void {
  const paperVars = paperDataRef.current.paperVars;

  let itemLocX: number = paperVars.timelineLeft;
  for (let i = 0; i < storeRef.current.sequenceItems.length; i++) {
    const sequenceItem = storeRef.current.sequenceItems[i];
    const sequenceItemGroup = new paper.Group();
    let width = 0;
    if (sequenceItem.type === "station") {
      //draw box
      width = paperVars.pixelsPerSecondX * sequenceItem.subdividedDurationsMins[0] * 60;
      const stationBox = new paper.Rectangle(
        new paper.Point(itemLocX, paperVars.sequenceTop),
        new paper.Point(itemLocX + width, paperVars.sequenceTop + paperVars.sequenceHeight)
      );
      const boxColor =
        selectedEvaSequenceItemUuid === sequenceItem.uuid
          ? paperDataRef.current.styles.yellow
          : paperDataRef.current.styles.gray2;
      const stationBoxRounded = new paper.Path.Rectangle({
        rectangle: stationBox,
        radius: new paper.Size(5, 5),
        strokeColor: boxColor,
        strokeWidth: 1.5,
      });

      //draw label
      const stationMiddleX = itemLocX + width / 2;
      //abbreviate station name if too long
      let content = sequenceItem.name;
      if (width < 60 && width > 30) {
        content = `${content.substring(0, 2)}...`;
      } else if (width < 30) {
        content = `${content.substring(0, 1)}..`;
      }
      const gray2 =
        selectedEvaSequenceItemUuid === sequenceItem.uuid
          ? paperDataRef.current.styles.yellow
          : paperDataRef.current.styles.gray2;
      const label = new paper.PointText({
        point: new paper.Point(stationMiddleX, paperVars.sequenceTop + 14),
        justification: "center",
        content,
        fillColor: gray2,
      });
      //clip mask for station box
      const clipRectangle = new paper.Path.Rectangle(
        new paper.Point(itemLocX - 1, paperVars.sequenceTop - 1),
        new paper.Point(itemLocX + width + 1, paperVars.sequenceTop + paperVars.sequenceHeight + 1)
      );

      sequenceItemGroup.addChildren([clipRectangle, stationBoxRounded, label]);
      sequenceItemGroup.clipped = true;
    } else if (sequenceItem.type === "traverse") {
      width =
        paperVars.pixelsPerSecondX *
        sequenceItem.subdividedDurationsMins.reduce(
          (accumulator, currentValue) => accumulator + currentValue,
          0
        ) *
        60;
      const traverseColor =
        selectedEvaSequenceItemUuid === sequenceItem.uuid
          ? paperDataRef.current.styles.yellow
          : paperDataRef.current.styles.gray2;
      const traverseLine = new paper.Path.Line({
        from: new paper.Point(itemLocX, paperVars.sequenceTop + 10),
        to: new paper.Point(itemLocX + width, paperVars.sequenceTop + 10),
        strokeColor: traverseColor,
        strokeWidth: 1.5,
        dashArray: [5, 2],
      });
      sequenceItemGroup.addChild(traverseLine);
    }

    //draw background rectangle (that turns yellow when selected) and add it to the paper refs
    const bkgColor =
      selectedEvaSequenceItemUuid === sequenceItem.uuid
        ? paperDataRef.current.styles.lightYellow
        : paperDataRef.current.styles.gray4;
    const bkgRect = new paper.Path.Rectangle({
      rectangle: new paper.Rectangle(
        new paper.Point(itemLocX + 1, paperVars.timelineTop + 1),
        new paper.Point(itemLocX + width - 1, paperVars.sequenceTop - 5)
      ),
      fillColor: bkgColor,
      name: sequenceItem.uuid,
    });
    paperGroupsRef.current.graphBkg.addChild(bkgRect);

    //move x-axis location
    itemLocX += width;

    //draw sequence ending time marker
    let gray2: paper.Color = paperDataRef.current.styles.gray2;
    let lineColor: paper.Color = paperDataRef.current.styles.gray1;
    //highlight this ending time marker if the next sequence item is selected so the start time marker of the selected sequence is highlighted
    if (
      (i < storeRef.current.sequenceItems.length - 1 &&
        storeRef.current.sequenceItems[i + 1].uuid === selectedEvaSequenceItemUuid) ||
      selectedEvaSequenceItemUuid === sequenceItem.uuid
    ) {
      gray2 = paperDataRef.current.styles.yellow;
      lineColor = paperDataRef.current.styles.yellow;
    } else if (i === storeRef.current.sequenceItems.length - 1) {
      //the color of the time marker at the end of the EVA sequence
      lineColor = paperDataRef.current.styles.white;
    }
    const timeMarkerEnd = drawTimeMarker(paperDataRef, itemLocX, lineColor, gray2);
    timeMarkerEnd.name = sequenceItem.uuid;
  }

  //draw "Available" block at the end of the sequence
  if (storeRef.current.evaLengthCalculatedMins < storeRef.current.evaLengthMins) {
    if (Math.round(itemLocX) < paperVars.timelineLeft + paperVars.timeineWidth) {
      const availableMiddleX = (itemLocX + paperVars.timelineLeft + paperVars.timeineWidth) / 2;
      const seconds =
        (paperVars.timelineLeft + paperVars.timeineWidth - itemLocX) *
        (1 / paperVars.pixelsPerSecondX);
      const timeHrs = Math.floor(seconds / 3600);
      const timeMins = Math.round((seconds % 3600) / 60);
      const availableLabel = new paper.PointText({
        point: new paper.Point(availableMiddleX, paperVars.sequenceTop + 14),
        justification: "center",
        content: "Available (" + timeHrs + ":" + padZeros(timeMins, 2) + ")",
        fillColor: paperDataRef.current.styles.gray2,
        name: "availableLabel",
      });
      const group = new paper.Group();
      group.addChild(availableLabel);
    }
  }
}
/**
 * Draw the mouse hover line. Also dispatch information about where the
 * mouse is to the store
 * @param dispatch
 * @param paperDataRef
 * @param paperGroupsRef
 * @param storeRef
 * @param xLoc
 * @returns
 */
export const drawMouseHover = (
  dispatch: Dispatch<AnyAction>,
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<StoreData_PaperJS>,
  flattenedGraphData: MutableRefObject<GraphData>,
  xLoc: number,
  setHoverValues: Function,
  landerElevationMeters: number
): number => {
  //check if we're inside the bounds of the graph
  if (
    xLoc > paperDataRef.current.paperVars.timelineLeft &&
    xLoc < paperDataRef.current.paperVars.timelineLeft + paperDataRef.current.paperVars.timeineWidth
  ) {
    //remove old line, draw new line
    paperGroupsRef.current.hoverLine.removeChildren();
    paperGroupsRef.current.hoverLine.addChild(
      drawTimeMarker(
        paperDataRef,
        xLoc,
        paperDataRef.current.styles.brightBlue,
        paperDataRef.current.styles.brightBlue
      )
    );
    paperGroupsRef.current.hoverLine.bringToFront();
    paperGroupsRef.current.hoverLine.visible = true;

    //calculate hover seconds
    const seconds =
      (xLoc - paperDataRef.current.paperVars.timelineLeft) /
      paperDataRef.current.paperVars.pixelsPerSecondX;

    //determine sequence item
    let sequenceUuid = null;
    let sequenceItemPercentElapsed = null;
    for (const bkgBlock of paperGroupsRef.current.graphBkg.children) {
      if (
        bkgBlock.contains(new paper.Point(xLoc, paperDataRef.current.paperVars.timelineTop + 1))
      ) {
        //add 1 so the y point would be inside the block
        sequenceUuid = bkgBlock.name;
        const sequenceItem = storeRef.current.sequenceItems.find(
          (seqItem) => seqItem.uuid === bkgBlock.name
        );
        sequenceItemPercentElapsed =
          (seconds - sequenceItem.secondsStart) / (sequenceItem.subdividedTotalDurationMins * 60);
        break;
      }
    }

    const newHoverValues: HoverValues = {
      distanceFromLanderMeters: null,
      elevationMeters: null,
      slopeDegrees: null,
      walkbackDistanceFromLanderMeters: null,
      walkbackElevationMeters: null,
      walkbackSlopeDegrees: null,
    };

    //show the distance from lander in the hover value
    if (flattenedGraphData.current.distanceFromLanderXY) {
      // find the GraphDataItem of the distanceFromLander with the closest x value compared to xLoc
      let closestDistanceToXLoc = 1000000;
      for (const graphDataItem of flattenedGraphData.current.distanceFromLanderXY) {
        const absXDiff = Math.abs(graphDataItem.xPixel - xLoc);
        if (absXDiff < closestDistanceToXLoc) {
          newHoverValues.distanceFromLanderMeters = graphDataItem.val;
          closestDistanceToXLoc = absXDiff;
        }
      }
    }

    // find the GraphDataItem of the elevation with the closest x value compared to xLoc
    if (flattenedGraphData.current.elevationXY) {
      let closestDistanceToXLoc = 1000000;
      let lastGraphDataItem: GraphDataItem = null;
      for (const graphDataItem of flattenedGraphData.current.elevationXY) {
        const absXDiff = Math.abs(graphDataItem.xPixel - xLoc);
        if (absXDiff < closestDistanceToXLoc) {
          newHoverValues.elevationMeters = graphDataItem.val - landerElevationMeters;
          // calculate the slope angle between this graphDataItem and the previous one
          if (lastGraphDataItem) {
            newHoverValues.slopeDegrees = getSlope(
              lastGraphDataItem.xPixel,
              lastGraphDataItem.val,
              graphDataItem.xPixel,
              graphDataItem.val
            );
          }
          closestDistanceToXLoc = absXDiff;
        }
        lastGraphDataItem = graphDataItem;
      }
    }

    // find the GraphDataItem of the walkbackDistanceFromLander with the closest x value compared to xLoc
    if (flattenedGraphData.current.walkbackXY) {
      let closestDistanceToXLoc = 1000000;
      for (const graphDataItem of flattenedGraphData.current.walkbackXY) {
        const absXDiff = Math.abs(graphDataItem.xPixel - xLoc);
        if (absXDiff < closestDistanceToXLoc) {
          newHoverValues.walkbackDistanceFromLanderMeters = graphDataItem.val;
          closestDistanceToXLoc = absXDiff;
        }
      }
    } else {
      newHoverValues.walkbackDistanceFromLanderMeters = null;
    }

    // find the GraphDataItem of the walkbackElevationXY with the closest x value compared to xLoc
    if (flattenedGraphData.current.walkbackElevationXY) {
      let closestDistanceToXLoc = 1000000;
      let lastWalkbackGraphDataItem: GraphDataItem = null;
      for (const graphDataItem of flattenedGraphData.current.walkbackElevationXY) {
        const absXDiff = Math.abs(graphDataItem.xPixel - xLoc);
        if (absXDiff < closestDistanceToXLoc) {
          newHoverValues.walkbackElevationMeters = graphDataItem.val - landerElevationMeters;
          // calculate the slope angle between this graphDataItem and the previous one
          if (lastWalkbackGraphDataItem) {
            newHoverValues.slopeDegrees = getSlope(
              lastWalkbackGraphDataItem.xPixel,
              lastWalkbackGraphDataItem.val,
              graphDataItem.xPixel,
              graphDataItem.val
            );
          }
          closestDistanceToXLoc = absXDiff;
        }
        lastWalkbackGraphDataItem = graphDataItem;
      }
    } else {
      newHoverValues.walkbackElevationMeters = null;
    }

    // set the hover values for display to the left of the timeline
    setHoverValues(newHoverValues);

    //save hover data to store
    dispatch(setLeftPanelHoverUuid(sequenceUuid));
    dispatch(setMapItemHover({ seconds, sequenceUuid, sequenceItemPercentElapsed }));
    return sequenceUuid;
  } else {
    //mouse is outside of the graph area but is still inside paper canvas
    paperGroupsRef.current.hoverLine.visible = false;
    dispatch(setLeftPanelHoverUuid(null));
    dispatch(clearMapItemHover());
    return null;
  }
};

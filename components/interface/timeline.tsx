import isNil from "lodash/isNil";
import paper from "paper";
import {
  FunctionComponent,
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";

import styles from "./timeline.module.css";
import { padZeros } from "utils/formatting";
import { addPointsAtMeters, getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { useDispatch } from "react-redux";
import { clearHover, setHover } from "store/playheadHover";
import _ from "lodash";
import { Dispatch } from "@reduxjs/toolkit";

/**
 * Sets the stroke or fill color for an array of paper items
 * @param group a paper group that contains an array of paper items
 * @param customColor the color to set to
 */
function setColorForItems(group: paper.Item[], customColor: paper.Color = null) {
  for (const child of group) {
    if (child.hasStroke()) child.strokeColor = customColor;
    if (child.hasFill()) child.fillColor = customColor;
  }
}

/**
 * Highlight the timeline with the selected sequence index
 */
function highlightSelection(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>
) {
  const sequenceItemUuid = storeRefs.current.selectedEvaSequenceItemUuid;
  //highlight time markers
  for (let i = 0; i < paperRefs.current.timeMarkers.children.length; i++) {
    const timeMarkerGroup = paperRefs.current.timeMarkers.children[i];
    if (timeMarkerGroup.name === sequenceItemUuid) {
      setColorForItems(timeMarkerGroup.children, paperRefs.current.styles.selectedColor);
      if (i > 0) {
        const prevTimeMarkerGroup = paperRefs.current.timeMarkers.children[i - 1];
        setColorForItems(prevTimeMarkerGroup.children, paperRefs.current.styles.selectedColor);
      }
    } else if (i === paperRefs.current.timeMarkers.children.length - 1) {
      setColorForItems(timeMarkerGroup.children, paperRefs.current.styles.startEndHighlight);
    } else {
      setColorForItems(timeMarkerGroup.children, paperRefs.current.styles.lineColor);
    }
  }

  //highlight sequence
  for (const sequenceItemGroup of paperRefs.current.evaSequence) {
    const color =
      sequenceItemGroup.name === sequenceItemUuid
        ? paperRefs.current.styles.selectedColor
        : paperRefs.current.styles.sequenceColor;
    setColorForItems(sequenceItemGroup.children, color);
  }

  //highlight background
  for (const backgroundGroup of paperRefs.current.graphBkg.children) {
    const color =
      backgroundGroup.name === sequenceItemUuid
        ? paperRefs.current.styles.selectedBkgColor
        : paperRefs.current.styles.regularBkgColor;
    setColorForItems([backgroundGroup], color);
  }

  //highlight distance graph
  for (const distanceGraphGroup of paperRefs.current.landerDistance) {
    const color =
      distanceGraphGroup.name === sequenceItemUuid
        ? paperRefs.current.styles.selectedColor
        : paperRefs.current.styles.sequenceColor;
    setColorForItems(distanceGraphGroup.children, color);
  }
}

/**
 * Draws the vertical line wtih the rotated time at the bottom.
 * @param paperRefs object containing all the paper data
 * @param xLoc x location of the time marker
 * @param customColor optional color to draw the line with
 * @returns a paper group containing the line and time text
 */
function drawTimeMarker(
  paperRefs: MutableRefObject<PaperDrawings>,
  xLoc: number,
  customColor: paper.Color = null
): paper.Group {
  const paperVars = paperRefs.current.paperVars;

  const markerGroup = new paper.Group();
  const color = customColor || paperRefs.current.styles.lineColor;
  const verticalLine = new paper.Path.Line({
    from: new paper.Point(xLoc, paperVars.timelineTop),
    to: new paper.Point(xLoc, paperVars.timelineTop + paperVars.timelineHeight),
    strokeColor: color,
    strokeWidth: 1,
  });
  verticalLine.name = "lineMarker";
  const seconds = (xLoc - paperVars.timelineLeft) * (1 / paperVars.pixelsPerSecondX);
  const timeHrs = Math.floor(seconds / 3600);
  const timeMins = Math.round((seconds % 3600) / 60);
  const timeLabel = new paper.PointText({
    point: new paper.Point(xLoc + 4, paperVars.timelineTop + paperVars.timelineHeight + 30),
    justification: "left",
    fontFamily: paperRefs.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: color,
    content: timeHrs + ":" + padZeros(timeMins, 2),
  });
  timeLabel.rotate(
    -90,
    new paper.Point(xLoc + 4, paperVars.timelineTop + paperVars.timelineHeight + 30)
  );
  markerGroup.addChildren([timeLabel, verticalLine]);
  return markerGroup;
}

/**
 * Draws the y axis meter ticks
 * @param paperRefs object containing all the paper data
 * @param xLoc x location of the meter marker (for right or left y-axis)
 * @param yLoc y location of the meter marker
 * @param label label to display next to the meter marker
 * @param align alignment of the label and tickmark when drawn on on the right or left y-axis
 * @returns
 */
function drawMeterMarker(
  paperRefs: MutableRefObject<PaperDrawings>,
  xLoc: number,
  yLoc: number,
  label: string,
  align: "left" | "right"
): paper.Group {
  const markerGroup = new paper.Group();
  const horizontalLine = new paper.Path.Line({
    from: new paper.Point(xLoc + 10 * (align === "right" ? -1 : 1), yLoc),
    to: new paper.Point(xLoc, yLoc),
    strokeColor: paperRefs.current.styles.lineColor,
    strokeWidth: 1,
  });
  const meterLabel = new paper.PointText({
    point: new paper.Point(xLoc + 15 * (align === "right" ? -1 : 1), yLoc + 4),
    justification: align,
    fontFamily: paperRefs.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: paperRefs.current.styles.sequenceColor,
    content: label,
  });
  markerGroup.addChildren([horizontalLine, meterLabel]);
  return markerGroup;
}

/**
 * Draws graph axis
 * @param paperRefs
 * @param storeRefs
 */
function drawGraphAxis(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>
) {
  const paperVars = paperRefs.current.paperVars;

  //draw top and bottom lines
  const topLine = new paper.Path.Line({
    from: new paper.Point(paperVars.timelineLeft, paperVars.timelineTop),
    to: new paper.Point(paperVars.timelineLeft + paperVars.timeineWidth, paperVars.timelineTop),
    strokeColor: paperRefs.current.styles.lineColor,
  });
  const bottomLine = new paper.Path.Line({
    from: new paper.Point(paperVars.timelineLeft, paperVars.sequenceTop - 4),
    to: new paper.Point(paperVars.timelineLeft + paperVars.timeineWidth, paperVars.sequenceTop - 4),
    strokeColor: paperRefs.current.styles.lineColor,
  });
  paperRefs.current.graphAxis.addChildren([topLine, bottomLine]);

  //draw start and end lines for eva length
  drawTimeMarker(paperRefs, paperVars.timelineLeft, paperRefs.current.styles.startEndHighlight);
  drawTimeMarker(
    paperRefs,
    paperVars.timelineLeft + storeRefs.current.evaLengthMins * paperVars.pixelsPerSecondX * 60,
    paperRefs.current.styles.startEndHighlight
  );

  //draw PET label
  const petLabel = new paper.PointText({
    point: new paper.Point(
      paperVars.timelineLeft - 10,
      paperVars.timelineTop + paperVars.timelineHeight + 30
    ),
    justification: "left",
    fontFamily: paperRefs.current.styles.gNavigatorFontFamilyActivity,
    fontSize: 12,
    fillColor: "#FFFFFF",
    content: "PET",
  });
  petLabel.rotate(
    -90,
    new paper.Point(
      paperVars.timelineLeft - 10,
      paperVars.timelineTop + paperVars.timelineHeight + 30
    )
  );

  //draw left y-axis meters
  const markerSpacingPx = 20; //20px = spacing for markers
  //max meters
  drawMeterMarker(
    paperRefs,
    paperVars.timelineLeft,
    paperVars.timelineTop,
    Math.round(storeRefs.current.maxDistanceFromLanderMeters).toString(),
    "right"
  );
  // min meter (at 0)
  drawMeterMarker(
    paperRefs,
    paperVars.timelineLeft,
    paperVars.timelineTop + paperVars.graphHeight,
    "0",
    "right"
  );
  //inbetween meter lines
  const numDistanceMarkers = Math.floor(paperVars.graphHeight / markerSpacingPx);
  const metersBtwnDistanceMarkers =
    storeRefs.current.maxDistanceFromLanderMeters / numDistanceMarkers;
  for (let i = 1; i < numDistanceMarkers; i++) {
    drawMeterMarker(
      paperRefs,
      paperVars.timelineLeft,
      paperVars.timelineTop + metersBtwnDistanceMarkers * i * paperVars.pixelsPerMeterDistanceY,
      Math.round(
        storeRefs.current.maxDistanceFromLanderMeters - metersBtwnDistanceMarkers * i
      ).toString(),
      "right"
    );
  }

  //draw right y-axis meters
  const xLocRightYaxis = paperVars.timelineLeft + paperVars.timeineWidth;
  const spacingFromLanderMaker = markerSpacingPx * 0.8; //how close are we allow other markers to come close to the lander marker
  let elevationFromLander: number;

  //lander meter and horizontal axis
  if (storeRefs.current.landerElevationMeters) {
    drawMeterMarker(
      paperRefs,
      xLocRightYaxis,
      paperVars.timelineTop + paperVars.landerElevationFromGraphTop,
      `Lander (${Math.round(storeRefs.current.landerElevationMeters)})`,
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
      strokeColor: paperRefs.current.styles.lineColor,
    });
    paperRefs.current.graphAxis.addChild(landerLine);

    //max meters
    elevationFromLander =
      storeRefs.current.maxElevationMeters - storeRefs.current.landerElevationMeters;
    if (paperVars.landerElevationFromGraphTop > spacingFromLanderMaker) {
      drawMeterMarker(
        paperRefs,
        xLocRightYaxis,
        paperVars.timelineTop,
        `${Math.round(elevationFromLander)} (${Math.round(
          storeRefs.current.maxElevationMeters
        ).toString()})`,
        "left"
      );
    }
    //min meters
    elevationFromLander =
      storeRefs.current.landerElevationMeters - storeRefs.current.minElevationMeters;
    if (paperVars.graphHeight - paperVars.landerElevationFromGraphTop > spacingFromLanderMaker) {
      drawMeterMarker(
        paperRefs,
        xLocRightYaxis,
        paperVars.timelineTop + paperVars.graphHeight,
        `${Math.round(elevationFromLander)} (${Math.round(
          storeRefs.current.minElevationMeters
        ).toString()})`,
        "left"
      ); // min meter
    }
    //inbetween meter lines
    const numElevationMarkers = Math.floor(paperVars.graphHeight / markerSpacingPx);
    const metersBtwnElevationMarkers =
      (storeRefs.current.maxElevationMeters - storeRefs.current.minElevationMeters) /
      numElevationMarkers;
    for (let i = 1; i < numElevationMarkers; i++) {
      elevationFromLander = Math.abs(
        storeRefs.current.landerElevationMeters -
          (storeRefs.current.maxElevationMeters - metersBtwnElevationMarkers * i)
      );
      const pixelsFromLanderMarker = elevationFromLander * paperVars.pixelsPerMeterElevationY;
      if (pixelsFromLanderMarker > spacingFromLanderMaker) {
        drawMeterMarker(
          paperRefs,
          xLocRightYaxis,
          paperVars.timelineTop +
            metersBtwnElevationMarkers * i * paperVars.pixelsPerMeterElevationY,
          `${Math.round(elevationFromLander)} (${Math.round(
            storeRefs.current.maxElevationMeters - metersBtwnElevationMarkers * i
          ).toString()})`,
          "left"
        );
      }
    }
  }
}

/**
 * Draws the distance from lander line graph, and also the walk back if it's a station
 * @param paperRefs
 * @param storeRefs
 */
function drawLanderDistanceGraph(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>
) {
  const paperVars = paperRefs.current.paperVars;

  let itemLocX: number = paperVars.timelineLeft;
  for (const [sequenceItemIndex, sequenceItem] of storeRefs.current.sequenceItems.entries()) {
    if (
      !sequenceItem.subdividedDistFromLanderMeters ||
      sequenceItem.subdividedDistFromLanderMeters.length === 0
    ) {
      //there is no distance from lander calculated (can happen if lander location isn't set for this mission).
      continue;
    }
    const landerDistanceGroup = new paper.Group();
    landerDistanceGroup.name = sequenceItem.uuid;

    //draw walkback line if this is a station and it has a walkback
    if (sequenceItem.type === "station" && sequenceItem.walkback) {
      const walkbackGroup = drawWalkback(paperRefs, itemLocX, sequenceItem.walkback);
      paperRefs.current.walkbacks.push(walkbackGroup);
    }

    //draw a line for each duration segment
    for (const [durationIndex, duration] of sequenceItem.subdividedDurationsMins.entries()) {
      const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
      const itemLocYStart =
        paperVars.timelineTop +
        paperVars.graphHeight -
        sequenceItem.subdividedDistFromLanderMeters[durationIndex] *
          paperVars.pixelsPerMeterDistanceY;
      //on traverses, there's always one more item in distanceFromLander array than the duration array
      //if we're on a station, just make the End equal to the Start
      const itemLocYEnd =
        sequenceItem.subdividedDistFromLanderMeters.length - 1 > durationIndex
          ? paperVars.timelineTop +
            paperVars.graphHeight -
            sequenceItem.subdividedDistFromLanderMeters[durationIndex + 1] *
              paperVars.pixelsPerMeterDistanceY
          : itemLocYStart;
      const graphLine = new paper.Path.Line({
        from: new paper.Point(itemLocX, itemLocYStart),
        to: new paper.Point(itemLocX + width, itemLocYEnd),
        strokeColor: paperRefs.current.styles.sequenceColor,
        strokeWidth: 1.5,
      });
      landerDistanceGroup.addChild(graphLine);

      //draw first and last dots on the distance graph
      if (sequenceItemIndex === 0 && durationIndex === 0) {
        const diamond = new paper.Path.Rectangle({
          point: new paper.Point(itemLocX - 3, itemLocYStart - 3),
          size: 6,
          fillColor: paperRefs.current.styles.sequenceColor,
        });
        diamond.rotate(45);
        landerDistanceGroup.addChild(diamond);
      }
      if (
        sequenceItemIndex === storeRefs.current.sequenceItems.length - 1 &&
        durationIndex === sequenceItem.subdividedDurationsMins.length - 1
      ) {
        const diamond = new paper.Path.Rectangle({
          point: new paper.Point(itemLocX + width - 3, itemLocYStart - 3),
          size: 6,
          fillColor: paperRefs.current.styles.sequenceColor,
        });
        diamond.rotate(45);
        landerDistanceGroup.addChild(diamond);
      }

      paperRefs.current.landerDistance.push(landerDistanceGroup);
      itemLocX += width; //increment x
    }
  }
}

/**
 * Draws the walkback path for a given station
 * @param paperRefs
 * @param xLoc x location that the walkback starts
 * @param walkbackData the walkback data for a station
 * @param customColor optional color to draw the line with
 * @returns a papergroup containing the walkback drawing for this station
 */
function drawWalkback(
  paperRefs: MutableRefObject<PaperDrawings>,
  xLoc: number,
  walkbackData: Walkback_PaperJS,
  customColor: paper.Color = null
): paper.Group {
  const paperVars = paperRefs.current.paperVars;

  const walkbackGroup = new paper.Group();
  const color = customColor || paperRefs.current.styles.walkbackColor;
  let itemLocX: number = xLoc;

  //draw a line for each duration segment
  for (const [durationIdex, duration] of walkbackData.durationsMins.entries()) {
    const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
    const itemLocYStart =
      paperVars.timelineTop +
      paperVars.graphHeight -
      walkbackData.distanceFromLanderMeters[durationIdex] * paperVars.pixelsPerMeterDistanceY;
    //on traverses, there's always one more item in distanceFromLander array than the duration array
    //if we're on a station, just make the End equal to the Start
    const itemLocYEnd =
      walkbackData.distanceFromLanderMeters.length - 1 > durationIdex
        ? paperVars.timelineTop +
          paperVars.graphHeight -
          walkbackData.distanceFromLanderMeters[durationIdex + 1] *
            paperVars.pixelsPerMeterDistanceY
        : itemLocYStart;
    const graphLine = new paper.Path.Line({
      from: new paper.Point(itemLocX, itemLocYStart),
      to: new paper.Point(itemLocX + width, itemLocYEnd),
      strokeColor: color,
      strokeWidth: 1.5,
    });
    graphLine.dashArray = [5, 2];
    walkbackGroup.addChild(graphLine);
    itemLocX += width;
  }
  return walkbackGroup;
}

/**
 * Draws the elevation profile graph
 * @param paperRefs
 * @param storeRefs
 */
function drawElevationProfile(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>
) {
  if (!storeRefs.current.landerElevationMeters) return;

  const paperVars = paperRefs.current.paperVars;
  const elevationResolution = storeRefs.current.elevationResolutionMeters || 10; //10 default
  const width =
    (elevationResolution / storeRefs.current.traverseRateMSec) * paperVars.pixelsPerSecondX;
  //loop through sequence
  for (const sequenceItem of storeRefs.current.sequenceItems) {
    if (!sequenceItem.segmentElevationMeters) continue;
    //loop through segments
    const sequenceStartPixel =
      paperVars.timelineLeft + sequenceItem.secondsStart * paperVars.pixelsPerSecondX;
    let itemLocX: number = sequenceStartPixel;
    for (const [
      segmentElevationIndex,
      segmentElevation,
    ] of sequenceItem.segmentElevationMeters.entries()) {
      const elevationGroup = new paper.Group();
      const pointArray = [];
      const landerYPixel = paperVars.timelineTop + paperVars.landerElevationFromGraphTop;

      //push first point at lander line
      pointArray.push([itemLocX, landerYPixel]);

      //loop through elevations
      for (const [elevationIndex, elevation] of segmentElevation.entries()) {
        pointArray.push([
          itemLocX,
          paperVars.timelineTop +
            (storeRefs.current.maxElevationMeters - elevation) * paperVars.pixelsPerMeterElevationY,
        ]);

        //the last point of current segment is equal to the first point in the next segment
        //  don't increment the x coordinate
        if (elevationIndex !== segmentElevation.length - 1) itemLocX += width;

        //the last elevation point may not be exactly the elevation resolution distance.
        //  don't use width. take the duration for this segment and set the x location
        //  for the next loop to be the end of the segment.
        if (elevationIndex === segmentElevation.length - 2) {
          let accumuatliveSegmentDistance = 0;
          for (let i = 0; i <= segmentElevationIndex; i++) {
            accumuatliveSegmentDistance += sequenceItem.segmentDistancesMeters[i];
          }
          itemLocX =
            sequenceStartPixel +
            accumuatliveSegmentDistance *
              (1 / storeRefs.current.traverseRateMSec) *
              paperVars.pixelsPerSecondX;
        }

        //this is a station
        if (segmentElevation.length === 1) {
          itemLocX =
            sequenceStartPixel +
            sequenceItem.subdividedTotalDurationMins * 60 * paperVars.pixelsPerSecondX;
          pointArray.push([
            itemLocX,
            paperVars.timelineTop +
              (storeRefs.current.maxElevationMeters - elevation) *
                paperVars.pixelsPerMeterElevationY,
          ]);
        }
      }

      //push last point at lander line
      pointArray.push([itemLocX, landerYPixel]);

      //add styling, add to group, and push group to paper refs.
      const segmentElevationPath = new paper.Path(pointArray);
      segmentElevationPath.fillColor = paperRefs.current.styles.elevationShade;
      segmentElevationPath.opacity = 0.5;
      segmentElevationPath.strokeWidth = 1.5;
      elevationGroup.addChild(segmentElevationPath);
      paperRefs.current.elevationProfile.push(elevationGroup);
    }
  }
}

/**
 * Draws the EVA sequence - station boxes, traverses, and vertical time markers
 * @param paperRefs
 * @param storeRefs
 */
function drawSequence(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>
) {
  const paperVars = paperRefs.current.paperVars;

  let itemLocX: number = paperVars.timelineLeft;
  for (let i = 0; i < storeRefs.current.sequenceItems.length; i++) {
    const sequenceItem = storeRefs.current.sequenceItems[i];
    const sequenceItemGroup = new paper.Group();
    let width = 0;
    if (sequenceItem.type === "station") {
      //draw box
      width = paperVars.pixelsPerSecondX * sequenceItem.subdividedDurationsMins[0] * 60;
      const stationBox = new paper.Rectangle(
        new paper.Point(itemLocX, paperVars.sequenceTop),
        new paper.Point(itemLocX + width, paperVars.sequenceTop + paperVars.sequenceHeight)
      );
      const stationBoxRounded = new paper.Path.Rectangle({
        rectangle: stationBox,
        radius: new paper.Size(5, 5),
        strokeColor: paperRefs.current.styles.sequenceColor,
        strokeWidth: 1.5,
      });

      //label
      const stationMiddleX = itemLocX + width / 2;
      const label = new paper.PointText({
        point: new paper.Point(stationMiddleX, paperVars.sequenceTop + 14),
        justification: "center",
        content: sequenceItem.name,
        fillColor: paperRefs.current.styles.sequenceColor,
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
      const traverseLine = new paper.Path.Line({
        from: new paper.Point(itemLocX, paperVars.sequenceTop + 10),
        to: new paper.Point(itemLocX + width, paperVars.sequenceTop + 10),
        strokeColor: paperRefs.current.styles.sequenceColor,
        strokeWidth: 1.5,
        dashArray: [5, 2],
      });
      sequenceItemGroup.addChild(traverseLine);
    }

    //add station or traverse group to the sequence array
    sequenceItemGroup.name = sequenceItem.uuid;
    paperRefs.current.evaSequence.push(sequenceItemGroup);

    //draw background rectangle (that turns yellow when selected) and add it to the paper refs
    const bkgRect = new paper.Path.Rectangle({
      rectangle: new paper.Rectangle(
        new paper.Point(itemLocX + 1, paperVars.timelineTop + 1),
        new paper.Point(itemLocX + width - 1, paperVars.sequenceTop - 5)
      ),
      fillColor: paperRefs.current.styles.regularBkgColor,
      name: sequenceItem.uuid,
    });
    paperRefs.current.graphBkg.addChild(bkgRect);

    //move x-axis location
    itemLocX += width;

    //draw sequence ending time marker and add it to the paper refs
    const markerColor =
      i === storeRefs.current.sequenceItems.length - 1
        ? paperRefs.current.styles.startEndHighlight
        : paperRefs.current.styles.lineColor;
    const timeMarkerEnd = drawTimeMarker(paperRefs, itemLocX, markerColor);
    timeMarkerEnd.name = sequenceItem.uuid;
    paperRefs.current.timeMarkers.addChild(timeMarkerEnd);
  }

  //draw "Available" block at the end of the sequence
  if (Math.round(itemLocX) < paperVars.timelineLeft + paperVars.timeineWidth) {
    const availableBox = new paper.Path.Rectangle({
      from: new paper.Point(itemLocX + 1, paperVars.timelineTop + 1),
      to: new paper.Point(
        paperVars.timelineLeft + paperVars.timeineWidth - 1,
        paperVars.sequenceTop - 5
      ),
      fillColor: paperRefs.current.styles.availableBkgColor,
      name: "availableBox",
    });
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
      fillColor: paperRefs.current.styles.sequenceColor,
      name: "availableLabel",
    });
    const group = new paper.Group();
    group.addChildren([availableBox, availableLabel]);
  }
}

/**
 * Initialize a new paper ref. Calcaulates the paper vars given the data in the store ref and canvas size
 */
function initPaperRef(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>
) {
  paperRefs.current = {
    timeMarkers: new paper.Group(),
    evaSequence: [],
    walkbacks: [],
    landerDistance: [],
    elevationProfile: [],
    graphBkg: new paper.Group(),
    graphAxis: new paper.Group(),
    hoverLine: new paper.Group(),
    styles: {
      lineColor: new paper.Color("#616574"), //var(--grey3)
      sequenceColor: new paper.Color("#FFFFFF"),
      startEndHighlight: new paper.Color("#00C2FF"),
      selectedBkgColor: new paper.Color("#41403B"),
      selectedColor: new paper.Color("#ffc700"), //var(--eva)
      availableBkgColor: new paper.Color("#424653"), //var(--grey2)
      regularBkgColor: new paper.Color("#313440"), //var(--grey1)
      walkbackColor: new paper.Color("#cb0000"), //var(--alert)
      gNavigatorFontFamilyActivity: "Inter",
      hoverColor: new paper.Color("#00C2FF"),
      elevationLine: new paper.Color("#5D3FD3"),
      elevationShade: new paper.Color("#BDB5D5"),
    },
    paperVars: {
      canvasWidth: paper.view.size.width, //full drawing area
      canvasHeight: paper.view.size.height,
      timelineHeight: null, //just the grpah drawing area
      timeineWidth: null,
      timelineTop: null,
      timelineLeft: null,
      sequenceTop: null,
      sequenceHeight: null,
      graphHeight: null,
      pixelsPerSecondX: null,
      pixelsPerMeterDistanceY: null,
      pixelsPerMeterElevationY: null,
      landerElevationFromGraphTop: null,
    },
  };
  const paperVars = paperRefs.current.paperVars; //save this to a shorter reference so it reduces the variable name when used below

  paperVars.timeineWidth = paperVars.canvasWidth * 0.8;
  paperVars.timelineHeight = paperVars.canvasHeight * 0.6;
  paperVars.timelineTop = (paperVars.canvasHeight - paperVars.timelineHeight) / 3;
  paperVars.timelineLeft = (paperVars.canvasWidth - paperVars.timeineWidth) / 2;
  paperVars.sequenceTop =
    paperVars.timelineTop + paperVars.timelineHeight - paperVars.timelineHeight * 0.25;
  paperVars.sequenceHeight = paperVars.timelineHeight * 0.2;
  paperVars.graphHeight = paperVars.sequenceTop - paperVars.timelineTop - 4; //4px buffer between graph bottom and beginning of sequence
  paperVars.pixelsPerSecondX =
    paperVars.timeineWidth /
    (Math.max(storeRefs.current.evaLengthMins, storeRefs.current.evaLengthCalculatedMins) * 60);
  paperVars.pixelsPerMeterDistanceY =
    paperVars.graphHeight / storeRefs.current.maxDistanceFromLanderMeters;
  paperVars.pixelsPerMeterElevationY =
    paperVars.graphHeight /
    (storeRefs.current.maxElevationMeters - storeRefs.current.minElevationMeters);
  if (!storeRefs.current.landerElevationMeters) {
    paperVars.landerElevationFromGraphTop = null;
  } else {
    paperVars.landerElevationFromGraphTop =
      (storeRefs.current.maxElevationMeters - storeRefs.current.landerElevationMeters) *
      paperVars.pixelsPerMeterElevationY;
  }
}

/**
 * Main function to draw the timeline. All the paper drawing happens here
 */
function drawTimeline(
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>,
  isEvaSelected: boolean
) {
  //clear project and initilize paper refs
  paper.project.clear();
  initPaperRef(paperRefs, storeRefs);

  //draw all the things
  drawGraphAxis(paperRefs, storeRefs);
  if (isEvaSelected) {
    drawSequence(paperRefs, storeRefs);
    drawLanderDistanceGraph(paperRefs, storeRefs);
    drawElevationProfile(paperRefs, storeRefs);
    highlightSelection(paperRefs, storeRefs);
  }
}

/**
 * On mouse hover handler for paper js
 */
const throttledOnMouseMove = (
  dispatch: Dispatch,
  paperRefs: MutableRefObject<PaperDrawings>,
  storeRefs: MutableRefObject<StoreData_PaperJS>,
  waitMs: number
) => {
  const handlerFn = (event: paper.MouseEvent) => {
    const xLoc = event.point.x;
    //check if we're inside the bounds of the graph
    if (
      xLoc > paperRefs.current.paperVars.timelineLeft &&
      xLoc < paperRefs.current.paperVars.timelineLeft + paperRefs.current.paperVars.timeineWidth
    ) {
      //remove old line, draw new line
      paperRefs.current.hoverLine.removeChildren();
      paperRefs.current.hoverLine.addChild(
        drawTimeMarker(paperRefs, event.point.x, paperRefs.current.styles.hoverColor)
      );
      paperRefs.current.hoverLine.bringToFront();
      paperRefs.current.hoverLine.visible = true;

      //calculate hover seconds
      const seconds =
        (event.point.x - paperRefs.current.paperVars.timelineLeft) /
        paperRefs.current.paperVars.pixelsPerSecondX;

      //determine sequence item
      let sequenceUuid = null;
      let sequenceItemPercentElapsed = null;
      for (const bkgBlock of paperRefs.current.graphBkg.children) {
        if (bkgBlock.contains(new paper.Point(xLoc, paperRefs.current.paperVars.timelineTop + 1))) {
          //add 1 so the y point would be inside the block
          sequenceUuid = bkgBlock.name;
          const sequenceItem = storeRefs.current.sequenceItems.find(
            (seqItem) => seqItem.uuid === bkgBlock.name
          );
          sequenceItemPercentElapsed =
            (seconds - sequenceItem.secondsStart) / (sequenceItem.subdividedTotalDurationMins * 60);
          break;
        }
      }

      //save hover data to store
      dispatch(setHover({ seconds, sequenceUuid, sequenceItemPercentElapsed }));
    } else {
      //mouse is outside of the grpah area but is still inside paper canvas
      paperRefs.current.hoverLine.visible = false;
      dispatch(clearHover());
    }
  };
  return _.throttle(handlerFn, waitMs, {
    leading: true,
    trailing: false,
  });
};

/**
 * Renders the navigation timeline presented at the bottom of the window
 */
const NavTimeline: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    shallowEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const evaTraverseRate = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid)?.traverseRate,
    refEqual
  );
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);

  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const paperRefs: MutableRefObject<PaperDrawings> = useRef(null);
  const storeRefs: MutableRefObject<StoreData_PaperJS> = useRef(null);

  /**
   * Populate storeRefs with all our store information so paper.js can read it.
   * Perform additional calculations required for drawing, such as subdividing any paths
   */
  const processDataFromStore = useCallback(() => {
    storeRefs.current = {
      sequenceItems: [],
      selectedEvaSequenceItemUuid,
      maxDistanceFromLanderMeters: 0,
      evaLengthMins: selectedEva?.maxDuration ? +selectedEva?.maxDuration : 240, //default 4 hours in minutes
      evaLengthCalculatedMins: 0,
      maxElevationMeters: null,
      minElevationMeters: null,
      landerElevationMeters: null,
      traverseRateMSec: null,
      elevationResolutionMeters: null,
    };

    if (selectedEva?.sequence && mission) {
      const planetRadius = parseFloat(mission?.config.msv.radius.minor);

      storeRefs.current.traverseRateMSec = isNaN(evaTraverseRate)
        ? 0
        : +evaTraverseRate * (1000 / 3600);
      storeRefs.current.elevationResolutionMeters = mission.config.tools.find(
        (tool) => tool.name === "Measure"
      )?.variables["resolution"];
      storeRefs.current.landerElevationMeters = mission.landerElevationMeters;

      for (const sequenceItem of selectedEva.sequence) {
        const sequenceItemForPaperJS: EvaSequenceItem_PaperJS = {
          ...sequenceItem,
          name: null,
          subdividedCoordinates: null,
          secondsStart: storeRefs.current.evaLengthCalculatedMins * 60,
          subdividedDurationsMins: null,
          subdividedTotalDurationMins: null,
          subdividedDistFromLanderMeters: null,
          segmentElevationMeters: null,
        };
        if (sequenceItem.type === "station") {
          const station = stations.find((station) => station.uuid === sequenceItem.uuid);
          if (!station) continue; //skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)
          sequenceItemForPaperJS.name = station.name;
          sequenceItemForPaperJS.subdividedCoordinates = station.location;
          sequenceItemForPaperJS.segmentElevationMeters = station.elevation
            ? [[station.elevation]]
            : null;

          //calculate duration from actions assigned to station
          let durationMinutes = 0;
          for (const action of actions) {
            if (action.stationUuid === sequenceItem.uuid) {
              //duration values come in as strings during edit mode
              const upper = isNaN(action.durationUpper) ? null : +action.durationUpper;
              const lower = isNaN(action.durationLower) ? null : +action.durationLower;
              const actionDuration = upper || lower;
              durationMinutes += isNaN(actionDuration) ? 0 : actionDuration;
            }
          }
          sequenceItemForPaperJS.subdividedDurationsMins = [durationMinutes];
          sequenceItemForPaperJS.subdividedTotalDurationMins = durationMinutes;
          storeRefs.current.evaLengthCalculatedMins += durationMinutes; //add to sum for total length calculated

          if (mission.landerLocation) {
            //calculate distance to lander
            const landerDistance = getDistanceBetweenTwoCoordinates(
              station.location,
              mission.landerLocation,
              planetRadius
            );

            if (landerDistance > storeRefs.current.maxDistanceFromLanderMeters)
              storeRefs.current.maxDistanceFromLanderMeters = landerDistance;
            sequenceItemForPaperJS.subdividedDistFromLanderMeters = [landerDistance];

            //calculate walkback path if this station has a walkback
            if (station.walkbackPath) {
              const walkback: Walkback_PaperJS = {
                path: null,
                durationsMins: null,
                distanceFromLanderMeters: null,
              };
              // subdivide seach segment by 150 meters for greater accuracy
              const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
                station.walkbackPath,
                150,
                planetRadius
              );
              walkback.path = newWalkbackPath;

              walkback.distanceFromLanderMeters = [];
              walkback.durationsMins = [];
              //loop through new subdivided walkback path
              for (let i = 0; i < newWalkbackPath.length; i++) {
                //calculate distance from lander. Track max distance
                const landerDistance = getDistanceBetweenTwoCoordinates(
                  newWalkbackPath[i],
                  mission.landerLocation,
                  planetRadius
                );

                if (landerDistance > storeRefs.current.maxDistanceFromLanderMeters)
                  storeRefs.current.maxDistanceFromLanderMeters = landerDistance;
                walkback.distanceFromLanderMeters.push(landerDistance);

                //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
                if (i !== newWalkbackPath.length - 1) {
                  const distanceSegment = getDistanceBetweenTwoCoordinates(
                    newWalkbackPath[i],
                    newWalkbackPath[i + 1],
                    planetRadius
                  );
                  const duration = isNaN(evaTraverseRate)
                    ? 0
                    : (distanceSegment / (+evaTraverseRate * 1000)) * 60;
                  walkback.durationsMins.push(duration);
                }
              }

              //set walkback data
              sequenceItemForPaperJS.walkback = walkback;
            }
          }
        } else if (sequenceItem.type === "traverse") {
          const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
          if (!traverse || traverse?.path?.length < 2) continue; //skip traverses with less than 2 points
          sequenceItemForPaperJS.name = traverse.name;

          //find max/min of elevation
          if (traverse.pathSegmentElevations) {
            for (const elevationSegment of traverse.pathSegmentElevations) {
              for (const elevation of elevationSegment) {
                if (
                  !storeRefs.current.maxElevationMeters ||
                  storeRefs.current.maxElevationMeters < elevation
                ) {
                  storeRefs.current.maxElevationMeters = elevation;
                }
                if (
                  !storeRefs.current.minElevationMeters ||
                  storeRefs.current.minElevationMeters > elevation
                ) {
                  storeRefs.current.minElevationMeters = elevation;
                }
              }
            }
          }

          //subdivide seach traverse segment by 150 meters for greater accuracy
          const newTraverse: AEGISPoint[] = addPointsAtMeters(traverse.path, 150, planetRadius);
          sequenceItemForPaperJS.subdividedCoordinates = newTraverse;

          sequenceItemForPaperJS.subdividedDistFromLanderMeters = [];
          sequenceItemForPaperJS.subdividedDurationsMins = [];
          sequenceItemForPaperJS.subdividedTotalDurationMins = 0;
          //loop through new subdivided traverse
          for (let i = 0; i < newTraverse.length; i++) {
            if (mission.landerLocation) {
              //calculate distance from lander. Track max distance
              const landerDistance = getDistanceBetweenTwoCoordinates(
                newTraverse[i],
                mission.landerLocation,
                planetRadius
              );
              if (landerDistance > storeRefs.current.maxDistanceFromLanderMeters)
                storeRefs.current.maxDistanceFromLanderMeters = landerDistance;
              sequenceItemForPaperJS.subdividedDistFromLanderMeters.push(landerDistance);
            }

            //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
            if (i !== newTraverse.length - 1) {
              const distanceSegment = getDistanceBetweenTwoCoordinates(
                newTraverse[i],
                newTraverse[i + 1],
                planetRadius
              );
              const duration = isNaN(evaTraverseRate)
                ? 0
                : (distanceSegment / (+evaTraverseRate * 1000)) * 60;
              sequenceItemForPaperJS.subdividedDurationsMins.push(duration);
              sequenceItemForPaperJS.subdividedTotalDurationMins += duration;
              storeRefs.current.evaLengthCalculatedMins += duration; //add to sum for total length calculated
            }
          }

          //elevation
          sequenceItemForPaperJS.segmentElevationMeters = traverse.pathSegmentElevations;
          sequenceItemForPaperJS.segmentDistancesMeters = traverse.pathSegmentDistances;
        }
        storeRefs.current.sequenceItems.push(sequenceItemForPaperJS);
      }
    }
  }, [
    selectedEva,
    stations,
    actions,
    traverses,
    evaTraverseRate,
    mission,
    selectedEvaSequenceItemUuid,
  ]);

  //use effect to handle when color highlighting when selected sequence item changes
  useEffect(() => {
    storeRefs.current.selectedEvaSequenceItemUuid = selectedEvaSequenceItemUuid;
    highlightSelection(paperRefs, storeRefs);
  }, [selectedEvaSequenceItemUuid]);

  // Initialize the timeline on first render
  useLayoutEffect(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }
    processDataFromStore(); //loads data into the storeRef
    drawTimeline(paperRefs, storeRefs, selectedEva !== undefined);

    //event handlers
    paper.view.onMouseMove = throttledOnMouseMove(dispatch, paperRefs, storeRefs, 15);
    // paper.view.onMouseEnter = () => {};
    paper.view.onMouseLeave = () => {
      paperRefs.current.hoverLine.visible = false;
      dispatch(clearHover());
    };
    paper.view.onResize = function () {
      drawTimeline(paperRefs, storeRefs, selectedEva !== undefined);
    };

    return () => paper.project.remove();
  }, [selectedEva, processDataFromStore, storeRefs, dispatch]);

  return (
    <>
      <div className={styles.canvasContainer}>
        <canvas ref={canvas} data-paper-resize />
      </div>
    </>
  );
};

export default NavTimeline;

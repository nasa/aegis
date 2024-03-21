import { MutableRefObject } from "react";
import paper from "paper";

/**
 * Initialize refs for paper. Sets colors and pixel boundaries based on canvas size
 */
export function initPaperRefs(
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>
): void {
  //init groups
  paperGroupsRef.current = {
    graphBkg: new paper.Group(),
    hoverLine: new paper.Group(),
    petLine: new paper.Group(),
    positionMarkers: new paper.Group(),
  };

  //init paper vars and styles
  paperDataRef.current = {
    styles: {
      gNavigatorFontFamilyActivity: "Inter",
      blue: new paper.Color("#93AFD7"),
      brightBlue: new paper.Color("#00C2FF"),
      green: new paper.Color("#8fae95"),
      brightGreen: new paper.Color("#52f075"),
      yellow: new paper.Color("#ffc700"),
      lightYellow: new paper.Color("#41403B"),
      grey1: new paper.Color("#616574"),
      grey2: new paper.Color("#a9a9a9"),
      grey3: new paper.Color("#424653"),
      grey4: new paper.Color("#313440"),
      grey5: new paper.Color("#d3d3d3"),
      white: new paper.Color("#EEEEEE"),
      red: new paper.Color("#FC5454"),
    },
    paperVars: {
      canvasWidth: paper.view.size.width, //full drawing area
      canvasHeight: paper.view.size.height,
      timelineHeight: null, //just the graph drawing area
      timelineWidth: null,
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

  //calculate paper vars. These are pixel and spacing variables that help determine where to draw things
  const paperVars = paperDataRef.current.paperVars; //save this to a shorter reference so it reduces the variable name when used below

  const yAxisLabelWidth = 75;
  paperVars.timelineWidth = paperVars.canvasWidth - yAxisLabelWidth * 2;
  paperVars.timelineHeight = paperVars.canvasHeight - 60;
  paperVars.timelineTop = 10;
  paperVars.timelineLeft = yAxisLabelWidth;
  paperVars.sequenceTop = paperVars.timelineTop + paperVars.timelineHeight;
  paperVars.sequenceHeight = 20;
  paperVars.graphHeight = paperVars.sequenceTop - paperVars.timelineTop - 4; //4px buffer between graph bottom and beginning of sequence
  paperVars.pixelsPerSecondX =
    paperVars.timelineWidth /
    (Math.round(
      Math.max(storeRef.current.evaLengthMins, storeRef.current.evaLengthCalculatedMins)
    ) *
      60);
  paperVars.pixelsPerMeterDistanceY =
    paperVars.graphHeight / storeRef.current.maxDistFromLanderMeters;
  paperVars.pixelsPerMeterElevationY =
    paperVars.graphHeight /
    (storeRef.current.maxElevationMeters - storeRef.current.minElevationMeters);
  if (!storeRef.current.landerElevationMeters) {
    paperVars.landerElevationFromGraphTop = null;
  } else {
    paperVars.landerElevationFromGraphTop =
      (storeRef.current.maxElevationMeters - storeRef.current.landerElevationMeters) *
      paperVars.pixelsPerMeterElevationY;
  }
}

/**
 * Initialize the graph items ref
 * This func translates all the geo data from the store into paper x y pixels for drawing
 * @param paperDataRef
 * @param storeRef
 * @param graphSequenceItems
 * @param flattenedGraphData
 */
export function initGraphItemsRef(
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>,
  graphSequenceItems: MutableRefObject<GraphSequenceItems>,
  flattenedGraphData: MutableRefObject<GraphData>
): void {
  //init graph data
  graphSequenceItems.current = {};
  flattenedGraphData.current = {
    elevationXY: [],
    distanceFromLanderXY: [],
    walkbackDistanceFromLanderXY: [],
    walkbackElevationXY: [],
  };

  const paperVars = paperDataRef.current.paperVars;
  //loop through sequence items. Seq items are drawn rounded to the nearest minute, so match that here.
  for (const sequenceItem of storeRef.current.sequenceItems) {
    const sequenceStartPixel =
      paperVars.timelineLeft + sequenceItem.secondsStart * paperVars.pixelsPerSecondX;
    const sequenceStartPixelRounded = roundPixelToNearestMinute(
      sequenceStartPixel,
      paperVars.pixelsPerSecondX,
      paperVars.timelineLeft
    );

    let graphData_elevation: GraphDataItem[] = []; //elevation profile for the sequence item
    let graphData_distFromLndr: GraphDataItem[] = [];
    let graphData_walkback: { distanceFromLander: GraphDataItem[]; elevation: GraphDataItem[] } = {
      distanceFromLander: [],
      elevation: [],
    };

    if (sequenceItem.type === "station") {
      //calc elevation profile
      if (storeRef.current.landerElevationMeters && sequenceItem.stationElevation) {
        graphData_elevation = calcElevation(
          [[sequenceItem.stationElevation]],
          null,
          sequenceStartPixel,
          sequenceStartPixelRounded,
          sequenceItem.totalDurationMins,
          paperDataRef,
          storeRef
        );
      }

      //calc walkback distance from lander and walkback elevation
      if (sequenceItem.stationWalkback) {
        graphData_walkback = calcStationWalkback(
          paperDataRef,
          storeRef,
          sequenceItem,
          sequenceStartPixel,
          sequenceStartPixelRounded
        );
      }
    } else if (sequenceItem.type === "traverse") {
      //calc elevation profile
      if (
        storeRef.current.landerElevationMeters &&
        sequenceItem.traverse.segmentedElevationMeters
      ) {
        graphData_elevation = calcElevation(
          sequenceItem.traverse.segmentedElevationMeters,
          sequenceItem.traverse.segmentedDistancesMeters,
          sequenceStartPixel,
          sequenceStartPixelRounded,
          sequenceItem.totalDurationMins,
          paperDataRef,
          storeRef
        );
      }
    }
    //calc dist from lander
    graphData_distFromLndr = calcDistFromLander(
      paperDataRef,
      sequenceItem,
      sequenceStartPixel,
      sequenceStartPixelRounded
    );

    //put all the new graph data for this sequence item in the ref
    graphSequenceItems.current[sequenceItem.uuid] = {
      type: sequenceItem.type,
      distanceFromLanderXY: graphData_distFromLndr,
      elevationXY: graphData_elevation,
      walkbackDistanceFromLanderXY: graphData_walkback.distanceFromLander,
      walkbackElevationXY: graphData_walkback.elevation,
    } as GraphSequenceData;

    // flatten the graph data items from all sequences to make it easier to access for hover values
    // note that walkback data is not added to the flattened graph data here. Instead, it's added using a useEffect based on the selected station
    flattenedGraphData.current.distanceFromLanderXY = [
      ...flattenedGraphData.current.distanceFromLanderXY,
      ...graphData_distFromLndr,
    ];
    flattenedGraphData.current.elevationXY = [
      ...flattenedGraphData.current.elevationXY,
      ...graphData_elevation,
    ];
  }
}

/**
 * Calculates station walkback distance-from-lander and walkback elevation point arrays
 * These calculations are not rounded since they are not constrained by time markers on the drawing
 * @param paperDataRef
 * @param storeRef
 * @param sequenceItem
 * @param sequenceStartPixel
 * @param sequenceStartPixelRounded
 * @returns distance from lander and elevation graph data arrays
 */
function calcStationWalkback(
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>,
  sequenceItem: EvaSequenceItem_PaperJS,
  sequenceStartPixel: number,
  sequenceStartPixelRounded: number
): { distanceFromLander: GraphDataItem[]; elevation: GraphDataItem[] } {
  const paperVars = paperDataRef.current.paperVars;

  const walkbackDistanceFromLander: GraphDataItem[] = []; //all walkbacks for the sequence.
  let walkbackElevation: GraphDataItem[] = []; //all walkback elevations for the sequence
  const walkbackData = sequenceItem.stationWalkback;

  //calc walkback distance from lander
  let xLoc: number = sequenceStartPixelRounded; //x location for this walkback
  for (const [durationIndex, duration] of walkbackData.subdividedDurationsMins.entries()) {
    const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
    const itemLocYStart =
      paperVars.timelineTop +
      paperVars.graphHeight -
      walkbackData.subdividedDistFromLanderMeters[durationIndex] *
        paperVars.pixelsPerMeterDistanceY;
    walkbackDistanceFromLander.push({
      xPixel: xLoc,
      yPixel: itemLocYStart,
      val: walkbackData.subdividedDistFromLanderMeters[durationIndex],
    });

    //we're on the last duration item
    if (durationIndex === walkbackData.subdividedDurationsMins.length - 1) {
      //add on the last point
      //distance array should have +1 more item than the duration array.
      const walkbackDistMetersEnd = walkbackData.subdividedDistFromLanderMeters[durationIndex + 1]; //meters
      const itemLocYEnd =
        paperVars.timelineTop +
        paperVars.graphHeight -
        walkbackDistMetersEnd * paperVars.pixelsPerMeterDistanceY;
      walkbackDistanceFromLander.push({
        xPixel: xLoc + width,
        yPixel: itemLocYEnd,
        val: walkbackDistMetersEnd,
      });
    }
    xLoc += width;
  }

  //calc walkback elevation
  if (storeRef.current.landerElevationMeters && walkbackData.segmentedElevationMeters) {
    walkbackElevation = calcElevation(
      walkbackData.segmentedElevationMeters,
      walkbackData.segmentedDistancesMeters,
      sequenceStartPixel,
      sequenceStartPixelRounded,
      walkbackData.subdividedDurationsMins.reduce(
        (accumulator, currentValue) => accumulator + currentValue,
        0
      ),
      paperDataRef,
      storeRef
    );
  }

  return {
    distanceFromLander: walkbackDistanceFromLander,
    elevation: walkbackElevation,
  };
}

/**
 * Calculate distance from lander point array for a station or traverse
 * @param paperDataRef
 * @param sequenceItem
 * @param sequenceStartPixel
 * @param sequenceStartPixelRounded
 * @returns
 */
function calcDistFromLander(
  paperDataRef: MutableRefObject<PaperData>,
  sequenceItem: EvaSequenceItem_PaperJS,
  sequenceStartPixel: number,
  sequenceStartPixelRounded: number
): GraphDataItem[] {
  const paperVars = paperDataRef.current.paperVars;
  const graphData_distFromLndr: GraphDataItem[] = [];

  let xLoc: number = sequenceStartPixelRounded;
  const xLocMax =
    sequenceStartPixel + sequenceItem.totalDurationMins * 60 * paperVars.pixelsPerSecondX;
  const xLocMaxRounded = roundPixelToNearestMinute(
    xLocMax,
    paperVars.pixelsPerSecondX,
    paperVars.timelineLeft
  );

  if (sequenceItem.type === "station") {
    graphData_distFromLndr.push({
      xPixel: xLoc,
      yPixel:
        paperVars.timelineTop +
        paperVars.graphHeight -
        sequenceItem.stationDistFromLanderMeters * paperVars.pixelsPerMeterDistanceY,
      val: sequenceItem.stationDistFromLanderMeters,
    });
    graphData_distFromLndr.push({
      xPixel: xLocMaxRounded,
      yPixel:
        paperVars.timelineTop +
        paperVars.graphHeight -
        sequenceItem.stationDistFromLanderMeters * paperVars.pixelsPerMeterDistanceY,
      val: sequenceItem.stationDistFromLanderMeters,
    });
    return graphData_distFromLndr;
  }

  const totalDurationMinsRounded =
    (xLocMaxRounded - sequenceStartPixelRounded) / paperVars.pixelsPerSecondX / 60;
  const newSubdividedDurations = calcRoundedSubdividedDurations(
    sequenceItem.traverse,
    totalDurationMinsRounded
  );

  //loop through durations
  for (const [durationIndex, duration] of newSubdividedDurations.entries()) {
    const distFromLanderMeters =
      sequenceItem.traverse.subdividedDistFromLanderMeters[durationIndex];
    const itemLocY =
      paperVars.timelineTop +
      paperVars.graphHeight -
      distFromLanderMeters * paperVars.pixelsPerMeterDistanceY;
    graphData_distFromLndr.push({
      xPixel: xLoc,
      yPixel: itemLocY,
      val: distFromLanderMeters,
    });

    //we're on the last duration item. plot the last point
    if (durationIndex === newSubdividedDurations.length - 1) {
      //distance array will have +1 more item than the duration array.
      const distFromLanderMetersEnd =
        sequenceItem.traverse.subdividedDistFromLanderMeters[durationIndex + 1]; //meters
      const itemLocYEnd =
        paperVars.timelineTop +
        paperVars.graphHeight -
        distFromLanderMetersEnd * paperVars.pixelsPerMeterDistanceY;
      graphData_distFromLndr.push({
        xPixel: xLocMaxRounded,
        yPixel: itemLocYEnd,
        val: distFromLanderMetersEnd,
      });
    }
    const width = duration * 60 * paperVars.pixelsPerSecondX; //duration is in minutes
    xLoc += width; //increment x
  }

  return graphData_distFromLndr;
}

/**
 * USes a new traverse rate calculated from total duration and distance and
 *  returns subdivided durations using the new traverse rate
 * @param traverse
 * @param totalDurationMinsRounded
 * @returns
 */
function calcRoundedSubdividedDurations(
  traverse: Path_PaperJS,
  totalDurationMinsRounded: number
): number[] {
  const subdividedDurationsRounded: number[] = [];
  const totalDistance = traverse.segmentedDistancesMeters.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0
  );
  const traverseRateRounded = totalDistance / totalDurationMinsRounded; //meters per minute

  for (const dist of traverse.subdividedDistMeters) {
    const duration = dist / traverseRateRounded;
    subdividedDurationsRounded.push(duration);
  }

  return subdividedDurationsRounded;
}

/**
 * Calculate elevation point array
 * @param segmentedElevationMeters elevation by segments
 * @param segmentedDistancesMeters distances by segments
 * @param xLocStart
 * @param xLocStartRounded
 * @param totalDurationMins
 * @param paperDataRef
 * @param storeRef
 * @returns an array of elevation graph data
 */
function calcElevation(
  segmentedElevationMeters: number[][],
  segmentedDistancesMeters: number[],
  xLocStart: number,
  xLocStartRounded: number,
  totalDurationMins: number,
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<EvaCalculated_PaperJS>
): GraphDataItem[] {
  const paperVars = paperDataRef.current.paperVars;
  //determine the end x pixel location using total duration. Round to nearest minute
  const xLocMax = xLocStart + totalDurationMins * 60 * paperVars.pixelsPerSecondX;
  const xLocMaxRounded = totalDurationMins
    ? roundPixelToNearestMinute(xLocMax, paperVars.pixelsPerSecondX, paperVars.timelineLeft)
    : xLocStartRounded;
  const totalDist = segmentedDistancesMeters
    ? segmentedDistancesMeters.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
    : 0;
  //calculate a new duration based on the rounded start and end time
  const totalDurationMinsRounded =
    (xLocMaxRounded - xLocStartRounded) / paperVars.pixelsPerSecondX / 60;
  //back-calculate an adjusted traverse rate, and utlimately determine the width to move the x pixel for each elevation
  const traverseRateMSecRounded = totalDist / (totalDurationMinsRounded * 60);
  const elevationResolution = storeRef.current.elevationResolutionMeters || 10; //10 default
  const widthRounded = (elevationResolution / traverseRateMSecRounded) * paperVars.pixelsPerSecondX;

  const graphData_elevation: GraphDataItem[] = [];
  let xLoc = xLocStartRounded;
  let prevXLoc = null;
  //loop through segments
  for (const [segmentIndex, segment] of segmentedElevationMeters.entries()) {
    //loop through elevations at the resolution
    for (const [elevationIndex, elevation] of segment.entries()) {
      // optimize by only drawing one point per x pixel
      if (
        xLoc !== prevXLoc &&
        Math.round(xLoc) !== Math.round(prevXLoc) &&
        xLoc <= xLocMaxRounded
      ) {
        graphData_elevation.push({
          xPixel: xLoc,
          yPixel:
            paperVars.timelineTop +
            (storeRef.current.maxElevationMeters - elevation) * paperVars.pixelsPerMeterElevationY,
          val: elevation,
        });
      }

      //this is a station. Add the last point at and break out
      if (segment.length === 1) {
        graphData_elevation.push({
          xPixel: xLocMaxRounded,
          yPixel:
            paperVars.timelineTop +
            (storeRef.current.maxElevationMeters - elevation) * paperVars.pixelsPerMeterElevationY,
          val: elevation,
        });
        break;
      }

      prevXLoc = xLoc;

      //the distance between the last 2 elevation points in this segment may not
      //  be exactly the elevation resolution distance, so we can't use width to
      //  calculate the next xLoc.
      if (elevationIndex === segment.length - 2) {
        //we're also in the last segment. Use the max
        if (segmentIndex === segmentedElevationMeters.length - 1) {
          xLoc = xLocMaxRounded;
        } else {
          //add all the previous segments distances together up to this point
          let accumuatliveSegmentDistance = 0;
          for (let i = 0; i <= segmentIndex; i++) {
            accumuatliveSegmentDistance += segmentedDistancesMeters[i];
          }
          xLoc =
            xLocStartRounded +
            (accumuatliveSegmentDistance / traverseRateMSecRounded) * paperVars.pixelsPerSecondX;
        }
      } else if (elevationIndex !== segment.length - 1) {
        //increment x unless we're at the last point in this segment.
        //the last point of current segment is equal to the first point in the next segment
        xLoc += widthRounded;
      }
    }
  }
  return graphData_elevation;
}

/**
 * Rounds a given x pixel to the nearest minute and returns back the new adjusted x pixel
 * This function is needed to conform how calcuations are made when rounding pixels.
 * It's used mainly in path calculations (walkbacks and traverses) with fractional durations
 * @param xPixel
 * @param pixelsPerSecondX
 * @param timelineStartLeft
 * @returns returns back the new adjusted x pixel
 */
function roundPixelToNearestMinute(
  xPixel: number,
  pixelsPerSecondX: number,
  timelineStartLeft: number
) {
  const minutes = Math.round(((xPixel - timelineStartLeft) * 1) / pixelsPerSecondX / 60);
  return minutes * 60 * pixelsPerSecondX + timelineStartLeft;
}

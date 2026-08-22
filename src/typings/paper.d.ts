type paper = typeof import("paper");
/**
 * References to the paper groups that we need later
 */
interface PaperGroups {
  graphBkg: paper.Group; //each child in the paper group is a sequence item
  hoverLine: paper.Group;
  petLine: paper.Group;
  positionMarkers: paper.Group;
}

interface MeasurePaperGroups {
  axisGroup: paper.Group;
  slopeGroup: paper.Group;
  lineSegmentMarksGroup: paper.Group;
  hoverGroup: paper.Group;
}

type PaperStyles = {
  gNavigatorFontFamilyActivity: string;
  blue: paper.Color;
  brightBlue: paper.Color;
  green: paper.Color;
  brightGreen: paper.Color;
  yellow: paper.Color;
  lightYellow: paper.Color;
  grey1: paper.Color;
  grey2: paper.Color;
  grey3: paper.Color;
  grey4: paper.Color;
  grey5: paper.Color;
  white: paper.Color;
  red: paper.Color;
};

/**
 * Contains styles, conversion rates, and boundaries that we
 *  need to determine where/how to draw things
 */
interface PaperData {
  styles: PaperStyles;
  paperVars: {
    //paper vars to help with math.
    canvasWidth: number; //full drawing area
    canvasHeight: number;
    timelineHeight: number; //just the timeline drawing area
    timelineWidth: number;
    timelineTop: number;
    timelineLeft: number;
    sequenceTop: number;
    sequenceHeight: number;
    graphHeight: number; //just the graph area that has the line graphs
    pixelsPerSecondX: number;
    pixelsPerMeterDistanceY: number;
    pixelsPerMeterElevationY: number;
    landerElevationFromGraphTop: number;
  };
}

interface MeasurePaperData {
  styles: PaperStyles;
  paperVars: {
    canvasWidth: number; //full drawing area
    canvasHeight: number;
    drawingHeight: number; //just the drawing drawing area
    drawingWidth: number;
    drawingTop: number;
    drawingLeft: number;
    graphHeight: number; //just the graph area that has the line graphs
    slopeTop: number;
    slopeHeight: number;
    pixelsPerMeterDistanceX: number;
    pixelsPerMeterElevationY: number;
    startElevationFromGraphTop: number;
  };
}

interface MeasureDerivedValues {
  startElevationMeters: number;
  minElevationMeters: number;
  maxElevationMeters: number;
  relativeElevationsMeters: number[][];
  elevationGraphValues: GraphDataItem[];
  totalDistanceMeters: number;
}

/**
 * Contains processed store data that paper will need.
 * Does not have any values based on pixels
 */
interface EvaCalculated_PaperJS {
  sequenceItems: EVASequenceItemForTimeline[];
  selectedEvaSequenceItemUuid: string;
  maxDistFromLanderMeters: number; //used to calculate top of left y-axis graph
  evaLengthMins: number; //user input eva length
  evaLengthCalculatedMins: number; //actual eval length from the station actions and traverses
  maxElevationMeters: number; //used to calculate top of right y-axis graph
  minElevationMeters: number; //used to calculate bottom of right y-axis graph
  landerElevationMeters: number;
  elevationResolutionMeters: number; //meters
  egressDurationMins: number;
  ingressDurationMins: number;
}

/**
 * Contains detailed information for a sequence item
 * Contains subdivided segments for drawing more accurate graph lines
 */
interface EVASequenceItemForTimeline extends EvaSequenceItem {
  name: string;
  secondsStart: number; //time when this sequence item starts
  totalDurationMins: number;
  traverseRateMSec: number;
  stationElevation?: number; //meters.
  stationDistFromLanderMeters?: number;
  stationWalkback?: Path_PaperJS;
  traverse?: Path_PaperJS;
  icon?: string;
}

//Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
interface Path_PaperJS {
  subdividedPath: AEGISPoint[];
  subdividedDistMeters: number[];
  subdividedDurationsMins?: number[]; //currently used for walkbacks only. traverses are calculated with a rounded traverse rate
  subdividedDistFromLanderMeters: number[]; //dist from lander values at each subdivided point
  segmentedElevationMeters: number[][]; //Not subdivided. First dimension is the original segments. 2nd dimension is elevations at the DEM resolution
  segmentedDistancesMeters: number[]; //Not subdivided. Distance between the original segments
}

interface TimelineHoverValues {
  distanceFromLanderMeters: number;
  elevationMeters: number;
  slopeDegrees: number;
  walkbackDistanceFromLanderMeters: number;
  walkbackElevationMeters: number;
  walkbackSlopeDegrees: number;
}

interface MeasureHoverValues {
  totalDistanceMeters: number;
  distanceFromStartMeters: number;
  elevationMeters: number;
  slopeDegrees: number;
}

interface GraphDataItem {
  xPixel: number; //the x pixel on the graph
  yPixel: number; //the y pixel on the graph
  val: number; //the y value that is represented (ex: distance from lander in meters)
  distanceMeters?: number; //physical x value, when the graph is distance-based
  slopeDegrees?: number; //local slope calculated over a physical-distance window
}

interface DistanceElevationDataItem {
  distanceMeters: number;
  elevationMeters: number;
}
interface GraphData {
  distanceFromLanderXY: GraphDataItem[];
  elevationXY: GraphDataItem[];
  walkbackDistanceFromLanderXY: GraphDataItem[];
  walkbackElevationXY: GraphDataItem[];
}

interface GraphSequenceData extends GraphData {
  type: "station" | "traverse";
  slopeXY: GraphDataItem[];
}
interface GraphSequenceItems {
  [uuid: string]: GraphSequenceData;
}

interface PosEntry_PaperJS extends PosEntry {
  distanceFromLanderMeters: number;
  walkback?: Path_PaperJS;
}

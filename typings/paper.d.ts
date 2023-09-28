/**
 * References to the paper groups that we need later
 */
interface PaperGroups {
  graphBkg: paper.Group; //each child in the paper group is a sequence item
  hoverLine: paper.Group;
  petLine: paper.Group;
  crewPositions: paper.Group;
}

/**
 * Contains styles, conversion rates, and boundaries that we
 *  need to determine where/how to draw things
 */
interface PaperData {
  styles: {
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
    white: paper.Color;
    red: paper.Color;
  };
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

/**
 * Contains processed store data that paper will need.
 * Does not have any values based on pixels
 */
interface EvaCalculated_PaperJS {
  sequenceItems: EvaSequenceItem_PaperJS[];
  selectedEvaSequenceItemUuid: string;
  maxDistFromLanderMeters: number; //used to calculate top of left y-axis graph
  evaLengthMins: number; //user input eva length
  evaLengthCalculatedMins: number; //actual eval length from the station actions and traverses
  maxElevationMeters: number; //used to calculate top of right y-axis graph
  minElevationMeters: number; //used to calculate bottom of right y-axis graph
  landerElevationMeters: number;
  elevationResolutionMeters: number; //meters
}

/**
 * Contains detailed information for a sequence item
 * Contains subdivided segments for drawing more accurate graph lines
 */
interface EvaSequenceItem_PaperJS extends EvaSequenceItem {
  name: string;
  secondsStart: number; //time when this sequence item starts
  totalDurationMins: number;
  traverseRateMSec: number;
  stationElevation?: number; //meters.
  stationDistFromLanderMeters?: number;
  stationWalkback?: Path_PaperJS;
  traverse?: Path_PaperJS;
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

interface HoverValues {
  distanceFromLanderMeters: number;
  elevationMeters: number;
  slopeDegrees: number;
  walkbackDistanceFromLanderMeters: number;
  walkbackElevationMeters: number;
  walkbackSlopeDegrees: number;
}

interface GraphDataItem {
  xPixel: number; //the x pixel on the graph
  yPixel: number; //the y pixel on the graph
  val: number; //the y value that is represented (ex: distance from lander in meters)
}
interface GraphData {
  distanceFromLanderXY: GraphDataItem[];
  elevationXY: GraphDataItem[];
  walkbackDistanceFromLanderXY: GraphDataItem[];
  walkbackElevationXY: GraphDataItem[];
}

interface GraphSequenceData extends GraphData {
  type: "station" | "traverse";
}
interface GraphSequenceItems {
  [uuid: string]: GraphSequenceData;
}

interface CrewPos_PaperJS extends CrewPos {
  distanceFromLanderMeters: number;
  walkback?: Path_PaperJS;
}

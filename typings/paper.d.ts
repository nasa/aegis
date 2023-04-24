/**
 * References to all the paper groups that are drawn
 */
interface PaperGroups {
  graphBkg: paper.Group; //each child in the paper group is a sequence item
  hoverLine: paper.Group;
}

/**
 * Contains data that paper needs to draw
 */
interface PaperData {
  styles: {
    gNavigatorFontFamilyActivity: string;
    blue: paper.Color;
    brightBlue: paper.Color;
    green: paper.Color;
    yellow: paper.Color;
    lightYellow: paper.Color;
    gray1: paper.Color;
    gray2: paper.Color;
    gray3: paper.Color;
    gray4: paper.Color;
    white: paper.Color;
    red: paper.Color;
  };
  paperVars: {
    //paper vars to help with math.
    canvasWidth: number; //full drawing area
    canvasHeight: number;
    timelineHeight: number; //just the timeline drawing area
    timeineWidth: number;
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
 * Contains processed store data that we paper will need.
 * Does not do any calucations based on pixels
 */
interface StoreData_PaperJS {
  sequenceItems: EvaSequenceItem_PaperJS[];
  flattenedGraphData: GraphData;
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
 * Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
 */
interface EvaSequenceItem_PaperJS extends EvaSequenceItem {
  name: string;
  secondsStart: number; //time when this sequence item starts
  subdividedTotalDurationMins: number;
  subdividedCoordinates: AEGISPoint | AEGISPoint[]; //single point for station. array of points for traverse
  subdividedDurationsMins: number[]; //duration for the subdivided coordinates
  subdividedDistFromLanderMeters: number[]; //distance for subdivided coordinates.
  segmentElevationMeters: number[][]; //meters. Not subdivided. First dimension is the original segments. 2nd dimension is elevations at the DEM resolution
  segmentDistancesMeters: number[]; //meters. Not subdivided. Distance between the original segments
  walkback?: Walkback_PaperJS; //for Stations only
  traverseRateMSec?: number; //for traverses only
}

//Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
interface Walkback_PaperJS {
  subdividedPath: AEGISPoint[];
  subdividedDurationMins: number[]; //duration for the subdivided path
  subdividedDistFromLanderMeters: number[]; //distance for subdivided path
  segmentElevationMeters: number[][]; //meters. Not subdivided. First dimension is the original segments. 2nd dimension is elevations at the DEM resolution
  segmentDistancesMeters: number[]; //meters. Not subdivided. Distance between the original segments
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
  walkbackXY: GraphDataItem[];
  walkbackElevationXY: GraphDataItem[];
}

interface GraphSequenceData extends GraphData {
  type: "station" | "traverse";
}
interface GraphSequenceItems {
  [uuid: string]: GraphSequenceData;
}

interface PaperDrawings {
  timeMarkers: paper.Group;
  evaSequence: paper.Group[];
  walkbacks: paper.Group[];
  landerDistance: paper.Group[];
  elevationProfile: paper.Group[];
  graphBkg: paper.Group;
  graphAxis: paper.Group;
  hoverLine: paper.Group;
  styles: {
    lineColor: paper.Color;
    labelColor: paper.Color;
    sequenceColor: paper.Color;
    startEndHighlight: paper.Color;
    selectedBkgColor: paper.Color;
    selectedColor: paper.Color;
    availableBkgColor: paper.Color;
    regularBkgColor: paper.Color;
    walkbackColor: paper.Color;
    gNavigatorFontFamilyActivity: string;
    hoverColor: paper.Color;
    elevationColor: paper.Color;
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

interface StoreData_PaperJS {
  sequenceItems: EvaSequenceItem_PaperJS[];
  selectedEvaSequenceItemUuid: string;
  maxDistanceFromLanderMeters: number; //used to calculate top of left y-axis graph
  evaLengthMins: number; //user input eva length
  evaLengthCalculatedMins: number; //actual eval length from the station actions and traverses
  maxElevationMeters: number; //used to calculate top of right y-axis graph
  minElevationMeters: number; //used to calculate bottom of right y-axis graph
  landerElevationMeters: number;
  traverseRateMSec: number; //m/sec
  elevationResolutionMeters: number; //meters
}

interface HoverValues {
  distanceFromLanderMeters: number;
  elevationMeters: number;
  slopeMetersPerMeter: number;
  walkbackDistanceFromLanderMeters: number;
  walkbackElevationMeters: number;
  walkbackSlopeMetersPerMeter: number;
}

interface GraphData {
  xPixels: number;
  val: number;
}
interface GraphItem {
  type: "station" | "traverse";
  distanceFromLander: GraphData[];
}
interface GraphItems {
  [uuid: string]: GraphItem;
}

/**
 * Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
 */
interface EvaSequenceItem_PaperJS extends EvaSequenceItem {
  name: string;
  secondsStart: number; //time when this sequence item starts
  subdividedTotalDurationMins: number;
  subdividedCoordinates: AEGISPoint | AEGISPoint[]; //single point for station. array of points for traverse
  subdividedDurationsMins: number[]; //duration for each segment in the coordinate array
  subdividedDistFromLanderMeters: number[]; //distance for each segment in the coordinate array
  segmentElevationMeters?: number[][]; //meters. Not subdivided.
  segmentDistancesMeters?: number[]; //meters. Not subdivided
  walkback?: Walkback_PaperJS; //for Stations only
}

//Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
interface Walkback_PaperJS {
  path: AEGISPoint[];
  durationsMins: number[]; //duration for each segment in the path array
  distanceFromLanderMeters: number[];
  segmentElevationMeters?: number[][]; //meters. Not subdivided.
  segmentDistancesMeters?: number[]; //meters. Not subdivided
}

interface PaperDrawings {
  timeMarkers: paper.Group;
  evaSequence: paper.Group[];
  walkbacks: paper.Group[];
  landerDistance: paper.Group[];
  graphBkg: paper.Group;
  graphAxis: paper.Group;
  hoverLine: paper.Group;
  styles: {
    lineColor: paper.Color;
    sequenceColor: paper.Color;
    startEndHighlight: paper.Color;
    selectedBkgColor: paper.Color;
    selectedColor: paper.Color;
    availableBkgColor: paper.Color;
    regularBkgColor: paper.Color;
    walkbackColor: paper.Color;
    gNavigatorFontFamilyActivity: string;
    hoverColor: paper.Color;
  };
  paperVars: {
    //paper vars to help with math.
    canvasWidth: number; //full drawing area
    canvasHeight: number;
    graphHeight: number; //just the grpah drawing area
    graphWidth: number;

    pixelsPerSecond: number;
    pixelsPerMeter: number;
    graphTop: number;
    graphLeft: number;
    sequenceTop: number;
    sequenceHeight: number;
    distanceGraphHeight: number;
  };
}

interface StoreData_PaperJS {
  sequenceItems: EvaSequenceItem_PaperJS[];
  selectedEvaSequenceItemUuid: string;
  maxDistanceFromLander: number; //used to calculate top of y axis graph
  evaLength: number; //minutes. user input eva length
  evaLengthCalculated: number; //minutes. actual eval length from the station actions and traverses
}

//Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
interface EvaSequenceItem_PaperJS extends EvaSequenceItem {
  name: string;
  coordinates: AEGISPoint | AEGISPoint[]; //single point for station. array of points for traverse
  durations: number[]; //minutes. duration for each segment in the coordinate array
  totalDuration: number; //minutes
  distanceFromLander: number[]; //meters. distance for each segment in the coordinate array
  walkback?: Walkback_PaperJS; //for Stations only
  secondsStart: number; //seconds
}

//Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
interface Walkback_PaperJS {
  path: AEGISPoint[];
  durations: number[]; //minutes. duration for each segment in the path array
  distanceFromLander: number[]; //meters. duration for each segment in the path array
}

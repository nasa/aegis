interface PaperDrawings {
  timeMarkers: paper.Group;
  evaSequence: paper.Group[];
  walkbacks: paper.Group[];
  landerDistance: paper.Group[];
  graphBkg: paper.Group;
  graphAxis: paper.Group;
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
  durations: number[]; //minutes
  distanceFromLander: number[]; //meters.
  walkback?: Walkback_PaperJS; //for Stations only
}

//Does not reflect the store values. Contains subdivided segments for drawing more accurate graph lines
interface Walkback_PaperJS {
  path: AEGISPoint[];
  durations: number[]; //minutes
  distanceFromLander: number[]; //meters
}

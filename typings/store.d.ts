/**
 * Playhead stores
 */
interface PlayheadState {
  /** Seconds representing the time into the mission day, eg. `0` is 00:00:00Z, `86399` is 23:59:59Z */
  seconds: number;
  /** UTC date being viewed */
  date: string;
  /** Whether the playhead actually is running */
  isRunning: boolean;
  /** Whether the user wants the playhead to be running */
  ready: boolean;
}

interface PlayheadHoverState {
  timelineSeqItemUuid: string; //when hovering over the timeline
  leftPanelItemUuid: string;
  mapItemUuid: string;
  evaSecondsElapsed: number /** Seconds representing the time into the mission that the mouse is hovering on via the nav-timeline */;
  sequenceItemPercentElapsed: number; //when hovering over the timline, represents % duration elapsed for that sequence item at that point in time
}

interface MissionState {
  mission: Mission;
  layers: Layer[];
  userInterface: UserInterface;
}

interface UserState {
  isLoggedIn: boolean;
  ironSessionData: IronSessionData;
}

interface UserInterface {
  navTimelineOpen: boolean;
  rightDrawerOpen: boolean;
}

interface MapState {
  layerControls: LayerControls;
  activeSelectedName: string;
  mousePosition: LatLng;
  mapDirective: MapDirective;
}

interface EvaState {
  selectedEvaRightNavItem: string;
  selectedEvaUuid: string;
  selectedEvaSequenceItemUuid: string;
  expandedEvaUuids: string[];
  evas: Eva[];
  evasFromDb: Eva[];
  evasEditing: string[];
  calculatedFields: EvaCalculatedFields[];
}

interface TraverseState {
  traverses: Traverse[];
  traversesFromDb: Traverse[];
  traversesEditing: string[];
  selectedTraverseRightNavItem: string;
  calculatedFields: TraverseCalculatedFields[];
}

interface PoiState {
  pois: POI[];
  poisFromDb: POI[];
  selectedPoiUuid: string;
  selectedRightNavItem: string;
  poisEditing: string[];
  calculatedFields: PoiCalculatedFields[];
}

interface PresetState {
  presets: Preset[];
  presetsFromDb: Preset[];
  selectedPresetUuid: string;
  selectedRightNavItem: string;
  presetInteractions: PresetInteractions;
  presetsEditing: string[];
}

type InterfaceSection = "map_layer_selector" | "poi" | "station" | "evas";
interface InterfaceState {
  sectionSelectedLabel: InterfaceSection;
  rightPanelOpen: boolean;
  elevationPendingItemUuids: string[];
  timelineShowDistanceFromLander: boolean;
  timelineShowElevation: boolean;
}

interface STMState {
  objectives: STMObjective[];
  goals: STMGoal[];
  investigations: STMInvestigation[];
}

interface StationState {
  stations: Station[];
  stationsFromDb: Station[];
  selectedStationUuid: string;
  selectedRightNavItem: string;
  stationsEditing: string[];
  calculatedFields: StationCalculatedFields[];
}

interface ActionState {
  actions: Action[];
  actionsFromDb: Action[];
}

type ReportItem = {
  message: string;
  type: "error" | "warning" | "info";
};

type CalculatedFields = {
  uuid: string;
  reportItems: ReportItem[];
};

type PoiCalculatedFields = CalculatedFields & {
  totalTime: TotalTimeObj;
  actionCount: number;
};

type StationCalculatedFields = CalculatedFields & {
  totalTime: TotalTimeObj;
  actionCount: number;
  walkbackDurationMinutes: number;
  walkbackDistanceMeters: number;
  walkbackAscentDescent: TotalAscentDescentObj;
};

type ActionsCalculatedFields = {
  totalActionTime: TotalTimeObj;
  actionCount: number;
};

type TraverseCalculatedFields = CalculatedFields & {
  durationMinutes: number;
  distanceMeters: number;
  ascentDescent: TotalAscentDescentObj;
};

type EvaReportSequenceItem = EvaSequenceItem & {
  name: string;
  icon?: string;
  reportItems: ReportItem[];
};

type EvaCalculatedFields = CalculatedFields & {
  totalStationTime: TotalTimeObj;
  totalStationActionCount: number;
  totalTraverseTime: number;
  totalTraverseDistanceMeters: number;
  totalTraverseAscentDescent: TotalAscentDescentObj;
  totalEvaTime: TotalTimeObj;
};

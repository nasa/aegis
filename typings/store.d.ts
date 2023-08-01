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
  missionFromDb: Mission;
  layers: Layer[];
  selectedRightNavItem: string;
  missionSectionsEditing: string[];
}

interface UserState {
  isLoggedIn: boolean;
  user: User;
  missionPerms: Permission;
}

interface MapState {
  mapLayerControls: MapLayerControls;
  mapCircleControls: MapCircleControls;
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
  presetsUIStates: PresetsUIStates;
  presetsEditing: string[];
}

type InterfaceSection = "mission" | "preset" | "poi" | "station" | "evas";
interface InterfaceState {
  sectionSelectedLabel: InterfaceSection;
  rightPanelOpen: boolean;
  elevationPendingItemUuids: string[];
  timelineShowDistanceFromLander: boolean;
  timelineShowElevation: boolean;
  actionsExpanded: string[];
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

type ActionsCalculatedFields = {
  totalTime: TotalTimeObj;
  totalEv1Time: TotalTimeObj;
  totalEv2Time: TotalTimeObj;
  totalUnassignedTime: TotalTimeObj;
  totalDwellTime: TotalTimeObj;
  actionCount: number;
};

type LocationCalculatedFields = CalculatedFields & ActionsCalculatedFields;

type PoiCalculatedFields = LocationCalculatedFields;

type StationCalculatedFields = LocationCalculatedFields & {
  walkbackDurationMinutes: number;
  walkbackDistanceMeters: number;
  walkbackAscentDescent: TotalAscentDescentObj;
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

type EvaCalculatedFields = LocationCalculatedFields & {
  totalTraverseTime: number;
  totalTraverseDistanceMeters: number;
  totalTraverseAscentDescent: TotalAscentDescentObj;
  totalEvaTime: TotalTimeObj;
};

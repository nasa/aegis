interface HoverState {
  timelineSeqItemUuid: string; //when hovering over the timeline
  leftPanelHoverItemUuid: string;
  mapItemUuid: string;
  mapItemType: MapItemType;
  posEntryItemUuid: string;
  evaSecondsElapsed: number /** Seconds representing the time into the mission that the mouse is hovering on via the nav-timeline */;
  sequenceItemPercentElapsed: number; //when hovering over the timline, represents % duration elapsed for that sequence item at that point in time
}

interface MissionState {
  mission: Mission;
  missionFromDb: Mission;
  layers: Layer[];
  sublayers: Sublayer[];
  selectedRightNavItem: string;
  missionSectionsEditing: string[];
  loadingStatus: LoadingStatus;
}

interface UserState {
  isLoggedIn: boolean;
  user: User;
  missionPerms: Permission;
}

interface MapState {
  mapSublayerControls: MapSublayerControls;
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
  loadingStatus: LoadingStatus;
}

interface TraverseState {
  traverses: Traverse[];
  traversesFromDb: Traverse[];
  traversesEditing: string[];
  selectedTraverseRightNavItem: string;
  calculatedFields: TraverseCalculatedFields[];
  loadingStatus: LoadingStatus;
}

interface PoiState {
  pois: POI[];
  poisFromDb: POI[];
  selectedPoiUuid: string;
  selectedRightNavItem: string;
  poisEditing: string[];
  calculatedFields: PoiCalculatedFields[];
  loadingStatus: LoadingStatus;
}

interface PresetState {
  presets: Preset[];
  presetsFromDb: Preset[];
  selectedPresetUuid: string;
  selectedRightNavItem: string;
  presetsUIStates: PresetsUIStates;
  presetsEditing: string[];
  loadingStatus: LoadingStatus;
}

type InterfaceSection = "mission" | "preset" | "poi" | "station" | "evas" | "rex";
interface InterfaceState {
  sectionSelectedLabel: InterfaceSection;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  elevationPendingItemUuids: string[];
  timelineShowDistanceFromLander: boolean;
  timelineShowElevation: boolean;
  actionsExpanded: string[];
  socketStatus: SocketStatus;
}

interface STMState {
  objectives: STMObjective[];
  goals: STMGoal[];
  investigations: STMInvestigation[];
  loadingStatus: LoadingStatus;
}

interface StationState {
  stations: Station[];
  stationsFromDb: Station[];
  selectedStationUuid: string;
  selectedRightNavItem: string;
  stationsEditing: string[];
  calculatedFields: StationCalculatedFields[];
  loadingStatus: LoadingStatus;
}

interface ActionState {
  actions: Action[];
  actionsFromDb: Action[];
  loadingStatus: LoadingStatus;
}

interface RexState {
  rexes: Rex[];
  rexesFromDb: Rex[];
  selectedRexUuid: string;
  expandedRexUuids: string[];
  selectedRexRightNavItem: string;
  rexesEditing: string[];
  rexesPosEntriesEditing: string[];
  selectedPosEntryUuid: string;
  posEntryEditingUuid: string; //only one can be in edit mode at a time
  loadingStatus: LoadingStatus;
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
  totalActionTime: TotalTimeObj;
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
  equipmentItems: EquipmentItemUsage[];
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

type EvaSequenceItemCalculatedData = {
  uuid: string;
  startSeconds: number;
  endSeconds: number;
};

type EvaCalculatedFields = LocationCalculatedFields & {
  totalTraverseTime: number;
  totalTraverseDistanceMeters: number;
  totalTraverseAscentDescent: TotalAscentDescentObj;
  totalEvaTime: TotalTimeObj;
  equipmentItems: EquipmentItemUsage[];
  sequenceItemsCalculatedData: EvaSequenceItemCalculatedData[];
};

interface MustContain {
  uuid: string;
  createdAt?: string;
  updatedAt?: string;
}

type LoadingStatus = "loading" | "loaded" | "unloaded" | "error";

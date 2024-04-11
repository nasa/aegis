interface HoverState {
  timelineSeqItemUuid: string; //when hovering over the timeline
  leftPanelHoverItemUuid: string;
  mapItemUuid: string;
  mapItemType: MapItemType;
  posEntryItemUuid: string;
  mapItemUuid: string;
  sequenceItemPercentElapsed: number; //when hovering over the timeline, represents % duration elapsed for that sequence item at that point in time
  measurementUuid: string;
  measurementPercentDistance: number;
}

interface MissionState {
  mission: Mission;
  missionFromDb: Mission;
  layers: Layer[];
  sublayers: Sublayer[];
  selectedRightNavItem: string;
  missionSectionsEditing: string[];
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
  mousePosition: AEGISPoint;
  mapDirective: MapDirective;
  measureInitialCoords: AEGISPoint[];
}

interface EvaState {
  selectedEvaRightNavItem: string;
  selectedEvaUuid: string;
  selectedEvaSequenceItemUuid: string;
  expandedEvaUuids: string[];
  evas: Eva[];
  evasFromDb: Eva[];
  evasEditing: string[];
}

interface TraverseState {
  traverses: Traverse[];
  traversesFromDb: Traverse[];
  traversesEditing: string[];
  selectedTraverseRightNavItem: string;
}

interface PoiState {
  pois: POI[];
  poisFromDb: POI[];
  selectedPoiUuid: string;
  selectedRightNavItem: string;
  poisEditing: string[];
}

interface PresetState {
  presets: Preset[];
  presetsFromDb: Preset[];
  selectedPresetUuid: string;
  selectedRightNavItem: string;
  presetsUIStates: PresetsUIStates;
  presetsEditing: string[];
}

interface STMViewExpandedItem {
  uuid: string;
  type: ActionType | "level3" | "action";
}

type InterfaceSection = "mission" | "preset" | "poi" | "station" | "evas" | "rex" | "stmViewer";
type BottomInterfaceSection = "timeline" | "measure";
interface InterfaceState {
  sectionSelectedLabel: InterfaceSection;
  bottomSectionSelectedLabel: BottomInterfaceSection;
  leftPanelIsOpen: boolean;
  rightPanelIsOpen: boolean;
  bottomPanelIsOpen: boolean;
  autoRightPanelOpen: boolean;
  autoBottomPanelOpen: boolean;
  elevationPendingItemUuids: string[];
  timelineShowDistanceFromLander: boolean;
  timelineShowElevation: boolean;
  actionsExpanded: string[];
  socketStatus: SocketStatus;
  stmViewExpandedItems: STMViewExpandedItem[];
  stmViewSelectedEvas: string[];
  stmViewSelectedActionTypes: ActionType[];
  stmViewExpandTopTiers: boolean;
  stmViewShowCrosshairs: boolean;
  stmViewHoveredTopItem: string;
  stmViewHoveredLeftItem: string;
}

interface STMState {
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
}

interface StationState {
  stations: Station[];
  stationsFromDb: Station[];
  selectedStationUuid: string;
  selectedRightNavItem: string;
  stationsEditing: string[];
}

interface ActionState {
  actions: Action[];
  actionsFromDb: Action[];
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
}

interface Measurement {
  uuid: string;
  createdAt: string;
  color: string;
  path: AEGISPoint[];
  pathSegmentDistances: number[]; //meters
  pathSegmentElevations: number[][]; //meters
}

interface MeasureState {
  measurements: Measurement[];
  selectedMeasurementUuid: string;
}

interface WholeStoreState {
  hover: HoverState;
  mission: MissionState;
  user: UserState;
  map: MapState;
  eva: EvaState;
  traverse: TraverseState;
  poi: PoiState;
  preset: PresetState;
  interface: InterfaceState;
  stm: STMState;
  station: StationState;
  action: ActionState;
  rex: RexState;
  measure: MeasureState;
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

type PoiCalculatedFields = CalculatedFields & ActionsCalculatedFields;

type StationCalculatedFields = CalculatedFields &
  ActionsCalculatedFields & {
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

type EvaCalculatedFields = CalculatedFields &
  ActionsCalculatedFields & {
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

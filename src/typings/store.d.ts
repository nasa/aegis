interface HoverState {
  timelineSeqItemUuid: string; //when hovering over the timeline
  leftPanelHoverItemUuid: string;
  mapItemUuid: string;
  mapItemType: MapItemType;
  posEntryItemUuid: string;
  sequenceItemPercentElapsed: number; //when hovering over the timeline, represents % duration elapsed for that sequence item at that point in time
  measurementUuid: string;
  measurementPercentDistance: number;
}

interface MissionState {
  layers: Layer[] | null;
  sublayers: Sublayer[] | null;
  selectedRightNavItem: string;
  /**
   * Single global edit-mode flag. When true, edit mode is on for mission, eva,
   * traverse, station, poi, rex, and action sections.
   */
  isInEditMode: boolean;
  automergeUrl: string;
}

interface UserState {
  isLoggedIn: boolean;
  appUser: AppUser;
  missionPerms: Permission;
  launchpadUser: LaunchpadUser;
}

interface MapState {
  mapDirective: MapDirective;
  /**
   * Original location(s) captured before a map edit begins, so a Cancel can
   * revert the item back to its pre-edit state.
   */
  originalPoints: AEGISPoint[];
  measureInitialCoords: AEGISPoint[];
  gridCornerPoint: MissionGridPoint;
}

interface EvaState {
  selectedEvaRightNavItem: string;
  selectedEvaUuid: string;
  selectedEvaSequenceItemUuid: string;
  expandedEvaUuids: string[];
  evaDropdownUIStates: EvaDropdownUIStates;
  showRunningRexOnly: boolean;
  runningRexExpanded: boolean;
}

interface EvaDropdownUIStates {
  [asPlannedEvaUuid: string]: string; // Maps EVA UUIDs to the currently selected dropdown item uuid
}

interface TraverseState {
  selectedTraverseRightNavItem: string;
}

interface PoiState {
  selectedPoiUuid: string;
  selectedRightNavItem: string;
}

interface PresetState {
  presets: Preset[];
  presetsFromDb: Preset[];
  selectedPresetUuid: string;
  selectedRightNavItem: string;
  presetLayersUIStates: LayersUIStates;
  presetCirclesUIStates: CirclesUIStates;
  presetsEditing: string[];
  presetPreviewTime: string;
}

interface STMViewExpandedItem {
  uuid: string;
  type: ActionType | "level3" | "action";
}

type InterfaceSection =
  | "mission"
  | "preset"
  | "poi"
  | "station"
  | "evas"
  | "stmViewer"
  | "stmRules";
type BottomInterfaceSection = "timeline" | "measure";
type SlopeColorMode = "standard" | "colorblind";
interface InterfaceState {
  sectionSelectedLabel: InterfaceSection;
  bottomSectionSelectedLabel: BottomInterfaceSection;
  leftPanelIsOpen: boolean;
  rightPanelIsOpen: boolean;
  bottomPanelIsOpen: boolean;
  mapMenuIsOpen: boolean;
  autoRightPanelOpen: boolean;
  autoBottomPanelOpen: boolean;
  elevationPendingItemUuids: string[];
  timelineShowDistanceFromLander: boolean;
  timelineShowElevation: boolean;
  slopeColorMode: SlopeColorMode;
  folders: Folder[];
  foldersInterface: FolderInterface[];
}

interface ConnectionState {
  socketStatus: ClientSocketStatus;
  browserConnectionStatus: ConnectionStatus;
  clientAppVersion: AppVersion;
}

interface STMState {
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
  rules: STMRule[];
  rulesFromDb: STMRule[];
  ruleEditingUuid: string;
  stmViewExpandedItems: STMViewExpandedItem[];
  stmViewSelectedEvas: string[];
  stmViewSelectedActionTypes: ActionType[];
  stmViewExpandTopTiers: boolean;
  stmViewShowCrosshairs: boolean;
  stmViewHoveredTopItem: string;
  stmViewHoveredLeftItem: string;
  stmRulesSelectedRexes: string[];
}

interface StationState {
  selectedStationUuid: string;
  selectedRightNavItem: string;
  stationCirclesUIStates: CirclesUIStates;
}

interface ActionState {
  actionsExpanded: string[];
}

interface RexState {
  selectedRexUuid: string;
  selectedPosEntryUuid: string;
  posEntryInEdit: PosEntry | null;
}

interface Measurement {
  uuid: string;
  createdAt: string;
  color: string;
  path: AEGISPoint[];
  pathSegmentDistances: number[]; //meters
  pathSegmentElevations: number[][] | null; //meters
  pathSegmentAbsoluteSlopes: (number | null)[][] | null; //degrees
  pathSegmentBearings: number[]; //degrees
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
  connection: ConnectionState;
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
  totalActionTime: number;
  totalEv1Time: number;
  totalEv2Time: number;
  totalUnassignedTime: number;
  totalDwellTime: number;
  actionCount: number;
  totalMass: number;
};

type LocationCalculatedFields = CalculatedFields & ActionsCalculatedFields;

type PoiCalculatedFields = CalculatedFields & ActionsCalculatedFields;

type StationCalculatedFields = CalculatedFields &
  ActionsCalculatedFields & {
    walkbackDurationMinutes: number;
    walkbackDistanceMeters: number;
    walkbackAscentDescent: TotalAscentDescentObj;
    equipmentItems: EquipmentItemUsages;
  };

type TraverseCalculatedFields = CalculatedFields &
  ActionsCalculatedFields & {
    durationMinutes: number;
    distanceMeters: number;
    ascentDescent: TotalAscentDescentObj;
    bearings: number[];
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
  manualStartSeconds: number;
  manualEndSeconds: number;
};

type EvaCalculatedFields = CalculatedFields &
  ActionsCalculatedFields & {
    totalTraverseTime: number;
    totalTraverseDistanceMeters: number;
    totalTraverseAscentDescent: TotalAscentDescentObj;
    totalEvaTime: number;
    equipmentItems: EquipmentItemUsages;
    sequenceItemsCalculatedData: EvaSequenceItemCalculatedData[];
  };

interface MustContainIsModified {
  uuid: string;
  createdAt?: string | number;
  updatedAt?: string | number;
}

type LoadingStatus = "loading" | "loaded" | "unloaded" | "error";

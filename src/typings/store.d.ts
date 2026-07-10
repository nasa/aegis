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
  | "stmRules"
  | "reports";
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
  ruleEditingUuid: string | null;
  stmViewExpandedItems: STMViewExpandedItem[];
  stmViewSelectedEvas: string[];
  stmViewSelectedActionTypes: ActionType[];
  stmViewExpandTopTiers: boolean;
  stmViewShowCrosshairs: boolean;
  stmViewHoveredTopItem: string | null;
  stmViewHoveredLeftItem: string | null;
  stmRulesSelectedRexes: string[];
  // v2 STM Satisfaction Rules pane (tabs). Deliberately separate from the legacy
  // v1 stmView* state above — v1 and v2 never share UI state. The column-report
  // UI/derived state (EVA STM Coverage, EVA Comparison) now lives in the `report`
  // slice, keyed by report id — see ReportState.
  stmRulesActiveTab: StmRulesTab;
  stmRulesSelectedStmUuid: string | null;
  stmRulesSelectedRuleUuid: string | null;
  stmRulesTierExpansion: StmRulesTierExpansion;
}

/**
 * UI + derived state for the column-family reports (EVA STM Coverage, EVA
 * Comparison). Both reports share the same column header band, grouping,
 * expansion, baseline + diff grammar and controls, so they share this shape.
 * The per-report instances are kept apart in ReportState so each tab keeps its
 * own baseline/diff/hidden/expanded columns and derived data.
 */
interface ColumnReportState {
  baselineColumnKey: string | null;
  diffMode: boolean;
  differencesOnly: boolean;
  rexStatusFilter: RexStatusFilter;
  hiddenColumns: string[];
  expandedColumns: string[];
  hoveredTopItem: string | null;
  hoveredLeftItem: string | null;
  drilldownWidth: number;
  // Drilldown diff filter: hide matched rows, show only plus/minus rows.
  drilldownChangesOnly: boolean;
  // Currently-selected cell (drives the coverage drilldown panel).
  cellSelection: StmCoverageCellSelection;
  // Derived data, computed once in the report page from the mission doc + the
  // stm slice and mirrored here so the grid components can read it without
  // prop-drilling. coverageByColumnKey is used by EVA STM Coverage;
  // metricsByColumnKey by EVA Comparison.
  visibleColumns: EvaReportColumn[];
  resolvedBaselineKey: string | null;
  sequenceByColumnKey: { [columnKey: string]: StmCoverageSequenceItem[] };
  // Left-axis row ids to show when "differences only" is on; null = show all.
  // (level3 uuids for coverage, metric-row ids for comparison.) Array, not Set,
  // to keep the store serializable.
  visibleRowIds: string[] | null;
  coverageByColumnKey: {
    [columnKey: string]: { [stmUuid: string]: StmCoverageLevel3 };
  };
  metricsByColumnKey: { [columnKey: string]: EvaComparisonColumnValues };
}

/** Patch pushed into a column report each render by its page's derived-data effect. */
type ColumnReportDerivedData = {
  visibleColumns: EvaReportColumn[];
  resolvedBaselineKey: string | null;
  sequenceByColumnKey: { [columnKey: string]: StmCoverageSequenceItem[] };
  visibleRowIds: string[] | null;
  coverageByColumnKey?: { [columnKey: string]: { [stmUuid: string]: StmCoverageLevel3 } };
  metricsByColumnKey?: { [columnKey: string]: EvaComparisonColumnValues };
};

/** Which set of EVAs the POI Traceability report is scoped to. */
type PoiTraceScope =
  | { type: "all" }
  | { type: "campaignPlanned"; campaignUuid: string }
  | { type: "campaignExecuted"; campaignUuid: string };

type PoiTraceSortKey = "priority" | "name";

/** UI state for the POI Traceability report (its own report-slice slot). */
interface PoiTraceState {
  scope: PoiTraceScope;
  filterText: string;
  sortKey: PoiTraceSortKey;
  selectedPoiUuid: string | null;
  /** null until the panel is first opened, then sized to half the pane width. */
  drilldownWidth: number | null;
}

type ColumnReportId = "stmCoverage" | "comparison";
type ReportId = ColumnReportId | "poiTrace";

/** All Reports-pane UI/derived state, keyed by report id. */
interface ReportState {
  stmCoverage: ColumnReportState;
  comparison: ColumnReportState;
  poiTrace: PoiTraceState;
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
  pathSegmentElevations: number[][]; //meters
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
  report: ReportState;
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

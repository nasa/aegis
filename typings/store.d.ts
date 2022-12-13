type LoadingStatus = "LOADING" | "LOADED";
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
  /** Seconds representing the time into the mission day that the mouse is hovering on via the nav-timeline */
  seconds: number;
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
}

interface EvaState {
  eva: Eva;
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
  presetsFromDB: Preset[];
  selectedPresetUuid: string;
  selectedRightNavItem: string;
}

interface InterfaceState {
  sectionSelectedLabel: "map_layer_selector" | "poi" | "eva_planner";
}

interface STMState {
  loadingStatus: LoadingStatus;
  mission: string;
  objectives: STMObjective[];
  goals: STMGoal[];
  investigations: STMInvestigation[];
}

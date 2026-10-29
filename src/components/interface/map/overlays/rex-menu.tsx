import type { FunctionComponent } from "react";
import { useEffect } from "react";
import {
  DockviewDefaultTab,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./rex-menu.module.css";
import { MapPositionMenu } from "components/interface/map/overlays/map-menu-pos";
import { MapAssetsMenu } from "components/interface/map/overlays/map-menu-assets";
import { setRexMenuIsMinimized } from "store/interface";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

const REX_MENU_WIDTH = 384;
const REX_MENU_HEIGHT = 320;
// The widget cannot be dragged/resized smaller than this (enforced in CSS on the floating
// resize container, see missionDockviewLayout.module.css).
const REX_MENU_MIN_WIDTH = 325;
const REX_MENU_MIN_HEIGHT = 318;
const REX_MENU_TOP_OFFSET = 10;
const REX_MENU_RIGHT_OFFSET = 10;
// Panels that live in the floating Rex Menu widget (Positions + Assets tabs). Their tabs cannot
// be closed; the whole widget is minimized instead.
export const REX_MENU_PANEL_IDS = ["positions", "assets"];

function getMapBounds(api: DockviewApi) {
  return api.getPanel("map")?.group.api.boundingBox;
}

// Anchors the widget to the top-right of the current map bounds, clamped so it never exceeds
// the map area nor drops below the enforced minimum size. x/y are relative to the map's top-left
// corner because the floating overlay host is pinned to the map panel.
function getRexMenuFloatingBounds(mapBounds: { width: number; height: number }) {
  const width = Math.max(REX_MENU_MIN_WIDTH, Math.min(REX_MENU_WIDTH, mapBounds.width));
  const height = Math.max(REX_MENU_MIN_HEIGHT, Math.min(REX_MENU_HEIGHT, mapBounds.height));
  return {
    x: Math.max(0, mapBounds.width - width - REX_MENU_RIGHT_OFFSET),
    y: Math.min(REX_MENU_TOP_OFFSET, Math.max(0, mapBounds.height - height)),
    width,
    height,
  };
}

// Bounds last applied to the widget via createRexMenuPanels, keyed by nothing but the module
// since only one mission layout is ever mounted at a time (matches REX_MENU_PANEL_IDS' same
// assumption). repositionRexMenuPanel compares against this instead of the widget's rendered
// DOM boundingBox: dockview's floating-group positioning (clamping in Overlay.setBounds /
// addFloatingGroup's Math.max(x, 0) floor) doesn't always settle to exactly the x/y/width/height
// that was requested, so a rendered-bounds comparison can permanently fail to match the naively
// computed desired bounds. Since createRexMenuPanels is itself called from inside
// repositionRexMenuPanel, and removePanel/addPanel re-fire onDidLayoutChange (which calls
// repositionRexMenuPanel again), a comparison that never converges reopens the widget forever —
// each recreation retriggers the layout-change event, hanging the tab. Comparing against the
// last bounds we *requested* (a pure function of mapBounds) instead guarantees the check matches
// as soon as mapBounds itself stops changing, regardless of how dockview rendered it.
let lastAppliedRexMenuBounds: { x: number; y: number; width: number; height: number } | null = null;

// Creates the two floating panels (Positions anchor + Assets tab) at the given bounds.
// `activeTabId` restores whichever tab was active before a reposition tore the widget down.
// Exported only so tests can seed an already-open widget through the real code path instead of
// duplicating these addPanel calls.
export function createRexMenuPanels(
  api: DockviewApi,
  bounds: { x: number; y: number; width: number; height: number },
  activeTabId?: string
): ReturnType<DockviewApi["addPanel"]> {
  const positionsPanel = api.addPanel({
    id: "positions",
    component: "positions",
    tabComponent: "nonClosable",
    title: "Positions",
    floating: { ...bounds, dragHandle: "tabbar" },
  });
  api.addPanel({
    id: "assets",
    component: "assets",
    tabComponent: "nonClosable",
    title: "Assets",
    position: { referencePanel: positionsPanel, direction: "within" },
    inactive: activeTabId !== "assets",
  });
  lastAppliedRexMenuBounds = bounds;
  return positionsPanel;
}

// Re-anchors the already-created widget to the current map bounds, e.g. after the right panel
// opens/closes and shrinks/grows the map area. Dockview has no public API to move a floating
// group's x/y in place, so this removes and recreates the two panels, preserving which tab was
// active and whether the widget was minimized.
export function repositionRexMenuPanel(
  api: DockviewApi,
  mapBounds: { width: number; height: number }
): void {
  const positionsPanel = api.getPanel("positions");
  if (!positionsPanel) return;

  const desired = getRexMenuFloatingBounds(mapBounds);
  const EPSILON = 1;
  if (
    lastAppliedRexMenuBounds &&
    Math.abs(lastAppliedRexMenuBounds.x - desired.x) < EPSILON &&
    Math.abs(lastAppliedRexMenuBounds.y - desired.y) < EPSILON &&
    Math.abs(lastAppliedRexMenuBounds.width - desired.width) < EPSILON &&
    Math.abs(lastAppliedRexMenuBounds.height - desired.height) < EPSILON
  ) {
    return;
  }

  const wasVisible = positionsPanel.group.api.isVisible;
  const activeTabId = positionsPanel.group.activePanel?.id;
  for (const id of REX_MENU_PANEL_IDS) {
    const panel = api.getPanel(id);
    if (panel) api.removePanel(panel);
  }
  const recreatedPositionsPanel = createRexMenuPanels(api, desired, activeTabId);
  recreatedPositionsPanel.group.api.setVisible(wasVisible);
}

const PositionsDockviewPanel: FunctionComponent = () => (
  <div className={styles.positionsPanel} data-testid="positions-floating-panel">
    <MapPositionMenu />
  </div>
);

const AssetsDockviewPanel: FunctionComponent = () => (
  <div className={styles.assetsPanel} data-testid="assets-floating-panel">
    <MapAssetsMenu />
  </div>
);

export const rexMenuComponents = {
  positions: PositionsDockviewPanel,
  assets: AssetsDockviewPanel,
};

const NonClosableTab: FunctionComponent<IDockviewPanelHeaderProps> = (props) => (
  <DockviewDefaultTab {...props} hideClose={true} />
);

export const rexMenuTabComponents = {
  nonClosable: NonClosableTab,
};

export const RexMenuHeaderActions: FunctionComponent<IDockviewHeaderActionsProps> = ({
  panels,
}) => {
  const dispatch = useAppDispatch();
  if (!panels.some((panel) => REX_MENU_PANEL_IDS.includes(panel.id))) return null;
  return (
    <div className={`${styles.headerActions}`}>
      <div className={styles.headerActionButtonTriangle} />
      <button
        className={styles.headerActionButton}
        onClick={() => dispatch(setRexMenuIsMinimized(true))}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content="Minimize"
        aria-label="Minimize Rex Menu"
        data-testid="rex-menu-minimize"
        type="button"
      >
        <FontAwesomeIcon icon={faXmark} size="sm" />
      </button>
    </div>
  );
};

// Manages the floating Rex Menu widget's two dockview panels (Positions + Assets tabs): creates
// them when the EVA section is active and a REX is selected, removes them otherwise, and toggles
// the group's visibility when minimized.
export function useRexMenuDockviewPanel(api: DockviewApi | null): void {
  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRexExists = useMissionDocSelector(
    (mission) => !!(selectedRexUuid && mission.rexes?.[selectedRexUuid]),
    refEqual
  );
  const showRexMenu = sectionSelected === "evas" && selectedRexExists;
  const rexMenuIsMinimized = useAppSelector(
    (state) => state.interface.rexMenuIsMinimized,
    refEqual
  );

  useEffect(() => {
    if (!api) return;
    const existingPanels = REX_MENU_PANEL_IDS.map((id) => api.getPanel(id)).filter(
      (panel) => !!panel
    );
    if (!showRexMenu) {
      for (const panel of existingPanels) api.removePanel(panel);
      lastAppliedRexMenuBounds = null;
      return;
    }
    if (existingPanels.length > 0) return;

    const mapBounds = getMapBounds(api);
    if (!mapBounds) return;
    createRexMenuPanels(api, getRexMenuFloatingBounds(mapBounds));
  }, [api, showRexMenu]);

  useEffect(() => {
    if (!api || !showRexMenu) return;
    api.getPanel("positions")?.group.api.setVisible(!rexMenuIsMinimized);
  }, [api, showRexMenu, rexMenuIsMinimized]);
}

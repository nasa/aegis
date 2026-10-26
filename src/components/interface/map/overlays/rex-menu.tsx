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
// the map area nor drops below the enforced minimum size.
function getRexMenuFloatingBounds(mapBounds: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const width = Math.max(REX_MENU_MIN_WIDTH, Math.min(REX_MENU_WIDTH, mapBounds.width));
  const height = Math.max(REX_MENU_MIN_HEIGHT, Math.min(REX_MENU_HEIGHT, mapBounds.height));
  return {
    x: mapBounds.left + Math.max(0, mapBounds.width - width - REX_MENU_RIGHT_OFFSET),
    y: mapBounds.top + Math.min(REX_MENU_TOP_OFFSET, Math.max(0, mapBounds.height - height)),
    width,
    height,
  };
}

// Creates the two floating panels (Positions anchor + Assets tab) at the given bounds.
// `activeTabId` restores whichever tab was active before a reposition tore the widget down.
function createRexMenuPanels(
  api: DockviewApi,
  bounds: { x: number; y: number; width: number; height: number },
  activeTabId?: string
) {
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
  return positionsPanel;
}

// Re-anchors the already-created widget to the current map bounds, e.g. after the right panel
// opens/closes and shrinks/grows the map area. Dockview has no public API to move a floating
// group's x/y in place, so this removes and recreates the two panels, preserving which tab was
// active and whether the widget was minimized.
export function repositionRexMenuPanel(
  api: DockviewApi,
  mapBounds: { left: number; top: number; width: number; height: number }
): void {
  const positionsPanel = api.getPanel("positions");
  if (!positionsPanel) return;

  const desired = getRexMenuFloatingBounds(mapBounds);
  const current = positionsPanel.group.api.boundingBox;
  const EPSILON = 1;
  if (
    current &&
    Math.abs(current.left - desired.x) < EPSILON &&
    Math.abs(current.top - desired.y) < EPSILON &&
    Math.abs(current.width - desired.width) < EPSILON &&
    Math.abs(current.height - desired.height) < EPSILON
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

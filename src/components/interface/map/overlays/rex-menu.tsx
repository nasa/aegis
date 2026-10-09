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
const REX_MENU_TOP_OFFSET = 10;
const REX_MENU_RIGHT_OFFSET = 10;
// Panels that live in the floating Rex Menu widget (Positions + Assets tabs). Their tabs cannot
// be closed; the whole widget is minimized instead.
export const REX_MENU_PANEL_IDS = ["positions", "assets"];

function getMapBounds(api: DockviewApi) {
  return api.getPanel("map")?.group.api.boundingBox;
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
    const width = Math.min(REX_MENU_WIDTH, mapBounds.width);
    const height = Math.min(REX_MENU_HEIGHT, mapBounds.height);
    const positionsPanel = api.addPanel({
      id: "positions",
      component: "positions",
      tabComponent: "nonClosable",
      title: "Positions",
      floating: {
        x: mapBounds.left + Math.max(0, mapBounds.width - width - REX_MENU_RIGHT_OFFSET),
        y: mapBounds.top + Math.min(REX_MENU_TOP_OFFSET, Math.max(0, mapBounds.height - height)),
        width,
        height,
        dragHandle: "tabbar",
      },
    });
    api.addPanel({
      id: "assets",
      component: "assets",
      tabComponent: "nonClosable",
      title: "Assets",
      position: { referencePanel: positionsPanel, direction: "within" },
      inactive: true,
    });
  }, [api, showRexMenu]);

  useEffect(() => {
    if (!api || !showRexMenu) return;
    api.getPanel("positions")?.group.api.setVisible(!rexMenuIsMinimized);
  }, [api, showRexMenu, rexMenuIsMinimized]);
}

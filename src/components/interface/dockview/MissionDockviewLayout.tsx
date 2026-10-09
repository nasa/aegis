import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FunctionComponent,
} from "react";
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type FloatingGroupDragContext,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "dockview-react/dist/styles/dockview.css";

import {
  BottomDrawerTab,
  BottomControlPanel,
  LeftDrawerTab,
  LeftControlPanel,
  NavGutter,
  RightDrawerTab,
  RightControlPanel,
} from "components/interface/side-controls";
import { AegisMapEditor } from "components/interface/map/AegisMapEditor";
import { MapMenuPanel } from "components/interface/map/overlays/map-menu";
import { MapPositionMenu } from "components/interface/map/overlays/map-menu-pos";
import { MapAssetsMenu } from "components/interface/map/overlays/map-menu-assets";
import { setMapMenuIsOpen, setRexMenuIsMinimized } from "store/interface";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

import styles from "./missionDockviewLayout.module.css";

const LEFT_OPEN_WIDTH = 400;
const LEFT_CLOSED_WIDTH = 40;
const BOTTOM_OPEN_HEIGHT = 256;
const BOTTOM_CLOSED_HEIGHT = 0;
const RIGHT_OPEN_WIDTH = 480;
const RIGHT_CLOSED_WIDTH = 0;
const MAP_MENU_WIDTH = 285;
const MAP_MENU_HEIGHT = 356;
const MAP_MENU_LEFT_OFFSET = 45;
const MAP_MENU_TOP_OFFSET = 10;
const PANEL_SEPARATOR_SIZE = 1;
const REX_MENU_WIDTH = 384;
const REX_MENU_HEIGHT = 320;
const REX_MENU_TOP_OFFSET = 10;
const REX_MENU_RIGHT_OFFSET = 10;
// Panels that live in the floating Rex Menu widget (Positions + Assets tabs). Their tabs cannot
// be closed; the whole widget is minimized instead.
const REX_MENU_PANEL_IDS = ["positions", "assets"];

const LeftPanel: FunctionComponent = () => {
  const selectedNavItem = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);

  return (
    <div className={styles.leftPanel} data-testid="mission-panel-left">
      <NavGutter selectedNavItem={selectedNavItem} />
      <LeftControlPanel />
    </div>
  );
};

const MapPanel: FunctionComponent = () => (
  <div className={styles.mapPanel} data-testid="mission-panel-map">
    <AegisMapEditor />
  </div>
);

const BottomPanel: FunctionComponent = () => (
  <div className={styles.bottomPanel} data-testid="mission-panel-bottom">
    <BottomControlPanel />
  </div>
);

const RightPanel: FunctionComponent = () => (
  <div className={styles.rightPanel} data-testid="mission-panel-right">
    <RightControlPanel />
  </div>
);

const MapMenuDockviewPanel: FunctionComponent = () => (
  <div className={styles.mapMenuPanel} data-testid="map-menu-floating-panel">
    <MapMenuPanel />
  </div>
);

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

const components = {
  left: LeftPanel,
  map: MapPanel,
  bottom: BottomPanel,
  right: RightPanel,
  "map-menu": MapMenuDockviewPanel,
  positions: PositionsDockviewPanel,
  assets: AssetsDockviewPanel,
};

const NonClosableTab: FunctionComponent<IDockviewPanelHeaderProps> = (props) => (
  <DockviewDefaultTab {...props} hideClose={true} />
);

const tabComponents = {
  nonClosable: NonClosableTab,
};

const RexMenuHeaderActions: FunctionComponent<IDockviewHeaderActionsProps> = ({ panels }) => {
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

function getMapBounds(api: DockviewApi) {
  return api.getPanel("map")?.group.api.boundingBox;
}

function setFixedPanelWidth(panel: ReturnType<DockviewApi["getPanel"]>, width: number) {
  if (!panel) return;
  panel.group.api.setConstraints({ minimumWidth: width, maximumWidth: width });
  panel.group.api.setSize({ width });
}

function setFixedPanelHeight(panel: ReturnType<DockviewApi["getPanel"]>, height: number) {
  if (!panel) return;
  panel.group.api.setConstraints({ minimumHeight: height, maximumHeight: height });
  panel.group.api.setSize({ height });
}

function setMapMenuSize(
  panel: ReturnType<DockviewApi["getPanel"]>,
  mapBounds: { width: number; height: number }
) {
  if (!panel) return;
  const width = Math.min(MAP_MENU_WIDTH, mapBounds.width);
  const height = Math.min(MAP_MENU_HEIGHT, mapBounds.height);
  panel.group.api.setConstraints({
    minimumWidth: width,
    minimumHeight: height,
    maximumWidth: width,
    maximumHeight: height,
  });
  panel.group.api.setSize({ width, height });
}

export function MissionDockviewLayout(): JSX.Element {
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const leftDrawerRef = useRef<HTMLDivElement>(null);
  const bottomDrawerRef = useRef<HTMLDivElement>(null);
  const rightDrawerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const leftPanelIsOpen = useAppSelector((state) => state.interface.leftPanelIsOpen, refEqual);
  const bottomPanelIsOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  const rightPanelIsOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);
  const mapMenuIsOpen = useAppSelector((state) => state.interface.mapMenuIsOpen, refEqual);
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
    const existingPanel = api.getPanel("map-menu");
    if (!mapMenuIsOpen) {
      if (existingPanel) api.removePanel(existingPanel);
      return;
    }
    if (existingPanel) {
      existingPanel.api.setActive();
      return;
    }

    const mapBounds = getMapBounds(api);
    if (!mapBounds) return;
    const width = Math.min(MAP_MENU_WIDTH, mapBounds.width);
    const height = Math.min(MAP_MENU_HEIGHT, mapBounds.height);
    const panel = api.addPanel({
      id: "map-menu",
      component: "map-menu",
      title: "Map Item Visibility",
      floating: {
        x: mapBounds.left + Math.min(MAP_MENU_LEFT_OFFSET, Math.max(0, mapBounds.width - width)),
        y: mapBounds.top + Math.min(MAP_MENU_TOP_OFFSET, Math.max(0, mapBounds.height - height)),
        width,
        height,
        dragHandle: "titlebar",
      },
    });
    panel.group.header.hidden = true;
    setMapMenuSize(panel, mapBounds);
  }, [api, mapMenuIsOpen]);

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

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const dockviewApi = event.api;
    if (!dockviewApi.getPanel("map")) {
      const map = dockviewApi.addPanel({ id: "map", component: "map" });
      const left = dockviewApi.addPanel({
        id: "left",
        component: "left",
        initialWidth: LEFT_OPEN_WIDTH,
        minimumWidth: LEFT_OPEN_WIDTH,
        maximumWidth: LEFT_OPEN_WIDTH,
        position: { referencePanel: map, direction: "left" },
      });
      const bottom = dockviewApi.addPanel({
        id: "bottom",
        component: "bottom",
        initialHeight: BOTTOM_OPEN_HEIGHT,
        minimumHeight: BOTTOM_OPEN_HEIGHT,
        maximumHeight: BOTTOM_OPEN_HEIGHT,
        position: { direction: "below" },
      });
      const right = dockviewApi.addPanel({
        id: "right",
        component: "right",
        initialWidth: RIGHT_OPEN_WIDTH,
        minimumWidth: RIGHT_OPEN_WIDTH,
        maximumWidth: RIGHT_OPEN_WIDTH,
        position: { direction: "right" },
      });

      for (const panel of [left, map, bottom, right]) {
        panel.group.api.locked = "no-drop-target";
      }
    }
    setApi(dockviewApi);
  }, []);

  useEffect(() => {
    if (!api) return;
    setFixedPanelWidth(api.getPanel("left"), leftPanelIsOpen ? LEFT_OPEN_WIDTH : LEFT_CLOSED_WIDTH);
  }, [api, leftPanelIsOpen]);

  useEffect(() => {
    if (!api) return;
    setFixedPanelHeight(
      api.getPanel("bottom"),
      bottomPanelIsOpen ? BOTTOM_OPEN_HEIGHT : BOTTOM_CLOSED_HEIGHT
    );
  }, [api, bottomPanelIsOpen]);

  useEffect(() => {
    if (!api) return;
    setFixedPanelWidth(
      api.getPanel("right"),
      rightPanelIsOpen ? RIGHT_OPEN_WIDTH : RIGHT_CLOSED_WIDTH
    );
  }, [api, rightPanelIsOpen]);

  useLayoutEffect(() => {
    if (!api) return;
    const updateLayout = () => {
      const container = containerRef.current;
      const leftPanel = container?.querySelector<HTMLElement>("[data-testid='mission-panel-left']");
      const bottomPanel = container?.querySelector<HTMLElement>(
        "[data-testid='mission-panel-bottom']"
      );
      const rightPanel = container?.querySelector<HTMLElement>(
        "[data-testid='mission-panel-right']"
      );
      if (container && leftPanel && bottomPanel && rightPanel) {
        const containerRect = container.getBoundingClientRect();
        const leftRect = leftPanel.getBoundingClientRect();
        const bottomRect = bottomPanel.getBoundingClientRect();
        const rightRect = rightPanel.getBoundingClientRect();

        if (leftDrawerRef.current) {
          leftDrawerRef.current.style.left = `${leftRect.right - containerRect.left}px`;
          leftDrawerRef.current.style.top = `${leftRect.top - containerRect.top + leftRect.height / 2}px`;
        }
        if (bottomDrawerRef.current) {
          bottomDrawerRef.current.style.left = `${bottomRect.left - containerRect.left}px`;
          bottomDrawerRef.current.style.top = `${bottomRect.top - containerRect.top + PANEL_SEPARATOR_SIZE}px`;
          bottomDrawerRef.current.style.width = `${bottomRect.width}px`;
        }
        if (rightDrawerRef.current) {
          rightDrawerRef.current.style.left = `${rightRect.left - containerRect.left - PANEL_SEPARATOR_SIZE}px`;
          rightDrawerRef.current.style.top = `${rightRect.top - containerRect.top + rightRect.height / 2}px`;
        }
      }

      const mapBounds = getMapBounds(api);
      const menuPanel = api.getPanel("map-menu");
      if (mapBounds && menuPanel) setMapMenuSize(menuPanel, mapBounds);
    };

    const layoutDisposable = api.onDidLayoutChange(updateLayout);
    const dimensionDisposables = ["left", "map", "bottom", "right"].map((id) =>
      api.getPanel(id)?.api.onDidDimensionsChange(updateLayout)
    );
    const removeDisposable = api.onDidRemovePanel((panel) => {
      if (panel.id === "map-menu") dispatch(setMapMenuIsOpen(false));
    });
    const resizeObserver = new ResizeObserver(updateLayout);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    updateLayout();
    return () => {
      layoutDisposable.dispose();
      for (const disposable of dimensionDisposables) disposable?.dispose();
      removeDisposable.dispose();
      resizeObserver.disconnect();
    };
  }, [api, dispatch]);

  const transformFloatingGroupDrag = useCallback(
    ({ group, proposed }: FloatingGroupDragContext) => {
      const isMapWidget = group.panels.some(
        (panel) => panel.id === "map-menu" || REX_MENU_PANEL_IDS.includes(panel.id)
      );
      if (!api || !isMapWidget) return;
      const mapBounds = getMapBounds(api);
      if (!mapBounds) return;
      return {
        left: Math.max(
          mapBounds.left,
          Math.min(proposed.left, mapBounds.left + mapBounds.width - proposed.width)
        ),
        top: Math.max(
          mapBounds.top,
          Math.min(proposed.top, mapBounds.top + mapBounds.height - proposed.height)
        ),
      };
    },
    [api]
  );

  return (
    <div ref={containerRef} className={styles.container} data-testid="mission-dockview">
      <DockviewReact
        components={components}
        tabComponents={tabComponents}
        rightHeaderActionsComponent={RexMenuHeaderActions}
        onReady={onReady}
        locked={true}
        disableDnd={true}
        floatingGroupBounds="boundedWithinViewport"
        floatingGroupDragHandle="titlebar"
        transformFloatingGroupDrag={transformFloatingGroupDrag}
      />
      <div ref={leftDrawerRef} className={styles.leftDrawer} data-testid="mission-drawer-left">
        <LeftDrawerTab />
      </div>
      <div
        ref={bottomDrawerRef}
        className={styles.bottomDrawer}
        data-testid="mission-drawer-bottom"
      >
        <BottomDrawerTab />
      </div>
      <div ref={rightDrawerRef} className={styles.rightDrawer} data-testid="mission-drawer-right">
        <RightDrawerTab />
      </div>
    </div>
  );
}

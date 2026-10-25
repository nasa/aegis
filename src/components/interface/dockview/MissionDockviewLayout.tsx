import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FunctionComponent,
} from "react";
import {
  DockviewReact,
  themeDark,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview-react";
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
import {
  rexMenuComponents,
  rexMenuTabComponents,
  RexMenuHeaderActions,
  useRexMenuDockviewPanel,
  repositionRexMenuPanel,
} from "components/interface/map/overlays/rex-menu";
import { refEqual, useAppSelector } from "utils/useAppSelector";

import styles from "./missionDockviewLayout.module.css";

const LEFT_OPEN_WIDTH = 400;
const LEFT_CLOSED_WIDTH = 40;
const BOTTOM_OPEN_HEIGHT = 256;
const BOTTOM_CLOSED_HEIGHT = 0;
const RIGHT_OPEN_WIDTH = 480;
const RIGHT_CLOSED_WIDTH = 0;
const PANEL_SEPARATOR_SIZE = 1;
const MAP_MINIMUM_WIDTH = 110;

// Dockview's built-in dark theme supplies the default tab formatting (active vs inactive tab
// colors, dividers, drag-over styles); missionDockviewLayout.module.css recolors it to the AEGIS
// palette via --dv-* variables, the same pattern CODA's dockview setup uses.
const dockviewTheme = themeDark;

const LeftPanel: FunctionComponent = () => {
  const selectedNavItem = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);

  return (
    <div className={styles.leftPanel} data-testid="mission-panel-left">
      <NavGutter selectedNavItem={selectedNavItem} />
      <LeftControlPanel />
    </div>
  );
};

const MapPanel: FunctionComponent = () => {
  const mapMenuIsOpen = useAppSelector((state) => state.interface.mapMenuIsOpen, refEqual);

  return (
    <div className={styles.mapPanel} data-testid="mission-panel-map">
      <AegisMapEditor />
      {mapMenuIsOpen && (
        <div className={styles.mapMenuPanel} data-testid="map-menu-floating-panel">
          <MapMenuPanel />
        </div>
      )}
    </div>
  );
};

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

const components = {
  left: LeftPanel,
  map: MapPanel,
  bottom: BottomPanel,
  right: RightPanel,
  ...rexMenuComponents,
};

function getMapBounds(api: DockviewApi) {
  return api.getPanel("map")?.group.api.boundingBox;
}

function setFixedPanelWidth(panel: ReturnType<DockviewApi["getPanel"]>, width: number) {
  if (!panel) return;
  const group = panel.group;
  if (group.minimumWidth !== width || group.maximumWidth !== width) {
    group.api.setConstraints({ minimumWidth: width, maximumWidth: width });
  }
  if (group.api.width !== width) group.api.setSize({ width });
}

function setFixedPanelHeight(panel: ReturnType<DockviewApi["getPanel"]>, height: number) {
  if (!panel) return;
  const group = panel.group;
  if (group.minimumHeight !== height || group.maximumHeight !== height) {
    group.api.setConstraints({ minimumHeight: height, maximumHeight: height });
  }
  if (group.api.height !== height) group.api.setSize({ height });
}

function getPanelWidths(containerWidth: number, leftOpen: boolean, rightOpen: boolean) {
  const desiredLeft = leftOpen ? LEFT_OPEN_WIDTH : LEFT_CLOSED_WIDTH;
  const desiredRight = rightOpen ? RIGHT_OPEN_WIDTH : RIGHT_CLOSED_WIDTH;
  const availableWidth = Math.max(0, containerWidth - 2 * PANEL_SEPARATOR_SIZE);
  if (containerWidth <= 0 || desiredLeft + desiredRight + MAP_MINIMUM_WIDTH <= availableWidth) {
    return { left: desiredLeft, right: desiredRight };
  }

  const left = leftOpen
    ? Math.min(LEFT_OPEN_WIDTH, Math.round(containerWidth * 0.4), availableWidth)
    : LEFT_CLOSED_WIDTH;
  const right = rightOpen
    ? Math.min(RIGHT_OPEN_WIDTH, Math.max(0, availableWidth - left - MAP_MINIMUM_WIDTH))
    : 0;
  return { left, right };
}

export function MissionDockviewLayout(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftDrawerRef = useRef<HTMLDivElement>(null);
  const bottomDrawerRef = useRef<HTMLDivElement>(null);
  const rightDrawerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const leftPanelIsOpen = useAppSelector((state) => state.interface.leftPanelIsOpen, refEqual);
  const bottomPanelIsOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  const rightPanelIsOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);

  useRexMenuDockviewPanel(api);

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

      // Confine the floating overlay host (which dockview sizes to the whole layout) to the map
      // panel, so dockview's own drag and resize clamping keeps floating widgets over the map.
      const mapPanel = container?.querySelector<HTMLElement>("[data-testid='mission-panel-map']");
      const floatingOverlayHostParent = container?.querySelector<HTMLElement>(
        ".dv-floating-overlay-host"
      )?.parentElement;
      if (container && mapPanel && floatingOverlayHostParent) {
        const mapRect = mapPanel.getBoundingClientRect();
        const hostParentRect = floatingOverlayHostParent.getBoundingClientRect();
        container.style.setProperty(
          "--floating-overlay-host-left",
          `${mapRect.left - hostParentRect.left}px`
        );
        container.style.setProperty(
          "--floating-overlay-host-top",
          `${mapRect.top - hostParentRect.top}px`
        );
        container.style.setProperty("--floating-overlay-host-width", `${mapRect.width}px`);
        container.style.setProperty("--floating-overlay-host-height", `${mapRect.height}px`);
      }

      const mapBounds = getMapBounds(api);
      if (mapBounds) repositionRexMenuPanel(api, mapBounds);
    };

    const layoutDisposable = api.onDidLayoutChange(updateLayout);
    const dimensionDisposables = ["left", "map", "bottom", "right"].map((id) =>
      api.getPanel(id)?.api.onDidDimensionsChange(updateLayout)
    );
    const resizeLayout = () => {
      const container = containerRef.current;
      if (!container) return;
      const widths = getPanelWidths(container.clientWidth, leftPanelIsOpen, rightPanelIsOpen);
      setFixedPanelWidth(api.getPanel("left"), widths.left);
      setFixedPanelWidth(api.getPanel("right"), widths.right);
      setFixedPanelHeight(
        api.getPanel("bottom"),
        bottomPanelIsOpen
          ? Math.min(BOTTOM_OPEN_HEIGHT, container.clientHeight)
          : BOTTOM_CLOSED_HEIGHT
      );
      api.layout(container.clientWidth, container.clientHeight);
      updateLayout();
    };
    const resizeObserver = new ResizeObserver(resizeLayout);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    resizeLayout();
    return () => {
      layoutDisposable.dispose();
      for (const disposable of dimensionDisposables) disposable?.dispose();
      resizeObserver.disconnect();
    };
  }, [api, leftPanelIsOpen, rightPanelIsOpen, bottomPanelIsOpen]);

  return (
    <div ref={containerRef} className={styles.container} data-testid="mission-dockview">
      <DockviewReact
        components={components}
        tabComponents={rexMenuTabComponents}
        rightHeaderActionsComponent={RexMenuHeaderActions}
        onReady={onReady}
        theme={dockviewTheme}
        locked={true}
        disableDnd={true}
        disableAutoResizing={true}
        floatingGroupBounds="boundedWithinViewport"
        floatingGroupDragHandle="titlebar"
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

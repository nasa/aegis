import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FunctionComponent,
} from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from "dockview-react";
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
import { refEqual, useAppSelector } from "utils/useAppSelector";

import styles from "./missionDockviewLayout.module.css";

const LEFT_OPEN_WIDTH = 400;
const LEFT_CLOSED_WIDTH = 40;
const BOTTOM_OPEN_HEIGHT = 256;
const BOTTOM_CLOSED_HEIGHT = 0;
const RIGHT_OPEN_WIDTH = 480;
const RIGHT_CLOSED_WIDTH = 0;
const PANEL_SEPARATOR_SIZE = 1;

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
};

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

export function MissionDockviewLayout(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftDrawerRef = useRef<HTMLDivElement>(null);
  const bottomDrawerRef = useRef<HTMLDivElement>(null);
  const rightDrawerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const leftPanelIsOpen = useAppSelector((state) => state.interface.leftPanelIsOpen, refEqual);
  const bottomPanelIsOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  const rightPanelIsOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);
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
    };

    const layoutDisposable = api.onDidLayoutChange(updateLayout);
    const dimensionDisposables = ["left", "map", "bottom", "right"].map((id) =>
      api.getPanel(id)?.api.onDidDimensionsChange(updateLayout)
    );
    const resizeObserver = new ResizeObserver(updateLayout);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    updateLayout();
    return () => {
      layoutDisposable.dispose();
      for (const disposable of dimensionDisposables) disposable?.dispose();
      resizeObserver.disconnect();
    };
  }, [api]);

  return (
    <div ref={containerRef} className={styles.container} data-testid="mission-dockview">
      <DockviewReact components={components} onReady={onReady} locked={true} disableDnd={true} />
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

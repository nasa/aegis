import { useCallback, useEffect, useState, type FunctionComponent } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type FloatingGroupDragContext,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";

import {
  BottomControlPanel,
  LeftControlPanel,
  NavGutter,
  RightControlPanel,
} from "components/interface/side-controls";
import { AegisMapEditor } from "components/interface/map/AegisMapEditor";
import { FeatureSourcesProvider } from "components/interface/map/FeatureSourcesProvider";
import { MapMenuPanel } from "components/interface/map/overlays/map-menu";
import { setMapMenuIsOpen } from "store/interface";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";

import styles from "./missionDockviewLayout.module.css";

const LEFT_OPEN_WIDTH = 400;
const LEFT_CLOSED_WIDTH = 40;
const BOTTOM_OPEN_HEIGHT = 256;
const BOTTOM_CLOSED_HEIGHT = 13;
const RIGHT_OPEN_WIDTH = 480;
const RIGHT_CLOSED_WIDTH = 13;
const MAP_MENU_WIDTH = 390;
const MAP_MENU_HEIGHT = 620;
const MAP_MENU_MIN_WIDTH = 300;
const MAP_MENU_MIN_HEIGHT = 220;
const MAP_MENU_LEFT_OFFSET = 45;
const MAP_MENU_TOP_OFFSET = 10;

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
    <FeatureSourcesProvider>
      <AegisMapEditor />
    </FeatureSourcesProvider>
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

const components = {
  left: LeftPanel,
  map: MapPanel,
  bottom: BottomPanel,
  right: RightPanel,
  "map-menu": MapMenuDockviewPanel,
};

function getMapBounds(api: DockviewApi) {
  return api.getPanel("map")?.group.api.boundingBox;
}

export function MissionDockviewLayout(): JSX.Element {
  const dispatch = useAppDispatch();
  const [api, setApi] = useState<DockviewApi | null>(null);
  const leftPanelIsOpen = useAppSelector((state) => state.interface.leftPanelIsOpen, refEqual);
  const bottomPanelIsOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  const rightPanelIsOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);
  const mapMenuIsOpen = useAppSelector((state) => state.interface.mapMenuIsOpen, refEqual);

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
    panel.api.setConstraints({
      minimumWidth: Math.min(MAP_MENU_MIN_WIDTH, mapBounds.width),
      minimumHeight: Math.min(MAP_MENU_MIN_HEIGHT, mapBounds.height),
      maximumWidth: mapBounds.width,
      maximumHeight: mapBounds.height,
    });
  }, [api, mapMenuIsOpen]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const dockviewApi = event.api;
    if (!dockviewApi.getPanel("map")) {
      const map = dockviewApi.addPanel({ id: "map", component: "map" });
      const left = dockviewApi.addPanel({
        id: "left",
        component: "left",
        initialWidth: LEFT_OPEN_WIDTH,
        position: { referencePanel: map, direction: "left" },
      });
      const bottom = dockviewApi.addPanel({
        id: "bottom",
        component: "bottom",
        initialHeight: BOTTOM_OPEN_HEIGHT,
        minimumHeight: BOTTOM_CLOSED_HEIGHT,
        position: { direction: "below" },
      });
      const right = dockviewApi.addPanel({
        id: "right",
        component: "right",
        initialWidth: RIGHT_OPEN_WIDTH,
        minimumWidth: RIGHT_CLOSED_WIDTH,
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
    api.getPanel("left")?.api.setSize({
      width: leftPanelIsOpen ? LEFT_OPEN_WIDTH : LEFT_CLOSED_WIDTH,
    });
  }, [api, leftPanelIsOpen]);

  useEffect(() => {
    if (!api) return;
    api.getPanel("bottom")?.api.setSize({
      height: bottomPanelIsOpen ? BOTTOM_OPEN_HEIGHT : BOTTOM_CLOSED_HEIGHT,
    });
  }, [api, bottomPanelIsOpen]);

  useEffect(() => {
    if (!api) return;
    api.getPanel("right")?.api.setSize({
      width: rightPanelIsOpen ? RIGHT_OPEN_WIDTH : RIGHT_CLOSED_WIDTH,
    });
  }, [api, rightPanelIsOpen]);

  useEffect(() => {
    if (!api) return;
    const layoutDisposable = api.onDidLayoutChange(() => {
      const mapBounds = getMapBounds(api);
      const menuPanel = api.getPanel("map-menu");
      if (!mapBounds || !menuPanel) return;
      menuPanel.api.setConstraints({
        minimumWidth: Math.min(MAP_MENU_MIN_WIDTH, mapBounds.width),
        minimumHeight: Math.min(MAP_MENU_MIN_HEIGHT, mapBounds.height),
        maximumWidth: mapBounds.width,
        maximumHeight: mapBounds.height,
      });
    });
    const removeDisposable = api.onDidRemovePanel((panel) => {
      if (panel.id === "map-menu") dispatch(setMapMenuIsOpen(false));
    });
    return () => {
      layoutDisposable.dispose();
      removeDisposable.dispose();
    };
  }, [api, dispatch]);

  const transformFloatingGroupDrag = useCallback(
    ({ group, proposed }: FloatingGroupDragContext) => {
      if (!api || group.panels[0]?.id !== "map-menu") return;
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
    <div className={styles.container} data-testid="mission-dockview">
      <DockviewReact
        components={components}
        onReady={onReady}
        locked={true}
        disableDnd={true}
        floatingGroupBounds="boundedWithinViewport"
        floatingGroupDragHandle="titlebar"
        transformFloatingGroupDrag={transformFloatingGroupDrag}
      />
    </div>
  );
}

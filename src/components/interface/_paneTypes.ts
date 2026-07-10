import MapSelector from "components/panes/preset/preset";
import MapSelectorRight from "components/panes/preset/preset-right";
import PoiEditor from "components/panes/poi/poi";
import PoiEditorRight from "components/panes/poi/poi-right";
import EvaPlanner from "components/panes/eva/eva";
import EvaPlannerRight from "components/panes/eva/eva-right";
import StationEditor from "components/panes/station/station";
import StationEditorRight from "components/panes/station/station-right";
import MissionConfig from "components/panes/mission/mission";
import MissionConfigRight from "components/panes/mission/mission-right";
import StmViewerPage from "components/panes/stm-legacy/stm-legacy-viewer-page";
import StmRulesPage from "components/panes/stm-rules/stm-rules-page";
import ReportsPage from "components/panes/reports/reports-page";
import StationIcon from "assets/station.svg?react";
import {
  faChartColumn,
  faCircle,
  faFlask,
  faGlobe,
  faRocket,
  faRoute,
} from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";

export const getPaneTypes = (actionSystemVersion = 1): PaneTypes => {
  const paneTypes: PaneTypes = {
    mission: {
      title: "Mission Configuration",
      leftPane: MissionConfig,
      rightPane: MissionConfigRight,
      color: "var(--mission)",
      icon: faRocket,
      fullScreen: false,
    },
    preset: {
      title: "Map Display Presets",
      leftPane: MapSelector,
      rightPane: MapSelectorRight,
      color: "var(--preset)",
      icon: faGlobe,
      fullScreen: false,
    },
    poi: {
      title: "Points of Interest",
      leftPane: PoiEditor,
      rightPane: PoiEditorRight,
      color: "var(--poi)",
      icon: faCircle,
      fullScreen: false,
    },
    station: {
      title: "Stations",
      leftPane: StationEditor,
      rightPane: StationEditorRight,
      color: "var(--station)",
      svgComponent: StationIcon,
      fullScreen: false,
    },
    evas: {
      title: "EVAs",
      leftPane: EvaPlanner,
      rightPane: EvaPlannerRight,
      color: "var(--eva)",
      icon: faRoute,
      fullScreen: false,
    },
  };
  if (actionSystemVersion === 1) {
    return {
      ...paneTypes,
      stmViewer: {
        title: "STM Viewer",
        leftPane: (): ReactNode => null,
        rightPane: StmViewerPage,
        color: "var(--stmViewer)",
        icon: faFlask,
        fullScreen: true,
      },
    };
  } else {
    return {
      ...paneTypes,
      stmRules: {
        title: "STM Satisfaction Rules",
        leftPane: (): ReactNode => null,
        rightPane: StmRulesPage,
        color: "var(--stmViewer)",
        icon: faFlask,
        fullScreen: true,
      },
      reports: {
        title: "Reports",
        leftPane: (): ReactNode => null,
        rightPane: ReportsPage,
        color: "var(--reports)",
        icon: faChartColumn,
        fullScreen: true,
      },
    };
  }
};

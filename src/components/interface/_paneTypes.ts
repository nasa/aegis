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
import RexLeft from "components/panes/rex/rex";
import RexRight from "components/panes/rex/rex-right";
import StmViewerPage from "components/panes/stm-viewer/stm-viewer-page";
import StmRulesPage from "components/panes/stm-rules/stm-rules-page";
import {
  faFlask,
  faGlobe,
  faLocationDot,
  faPersonWalkingArrowRight,
  faRocket,
  faRoute,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { ReactNode } from "react";

export const getPaneTypes = (actionSystemVersion = 1): PaneTypes => {
  const paneTypes: PaneTypes = {
    mission: {
      title: "Mission Configuration",
      leftPane: MissionConfig,
      rightPane: MissionConfigRight,
      color: "var(--mission)",
      icon: faRocket,
    },
    preset: {
      title: "Map Display Presets",
      leftPane: MapSelector,
      rightPane: MapSelectorRight,
      color: "var(--preset)",
      icon: faGlobe,
    },
    poi: {
      title: "Points of Interest",
      leftPane: PoiEditor,
      rightPane: PoiEditorRight,
      color: "var(--poi)",
      icon: faCircleDot,
    },
    station: {
      title: "Stations",
      leftPane: StationEditor,
      rightPane: StationEditorRight,
      color: "var(--station)",
      icon: faLocationDot,
    },
    evas: {
      title: "EVA Compositions",
      leftPane: EvaPlanner,
      rightPane: EvaPlannerRight,
      color: "var(--eva)",
      icon: faRoute,
    },
    rex: {
      title: "Real-time Execution",
      leftPane: RexLeft,
      rightPane: RexRight,
      color: "var(--rex)",
      icon: faPersonWalkingArrowRight,
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
    };
  }
};

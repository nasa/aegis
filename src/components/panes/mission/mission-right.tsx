import type { FunctionComponent } from "react";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import {
  faAtlas,
  faToolbox,
  faSliders,
  faBullseye,
  faFileExport,
  faListOl,
  faUserGraduate,
  faPersonDigging,
} from "@fortawesome/free-solid-svg-icons";

import Prefs_panel from "./mission-right-prefs";
import Circles_panel from "./mission-right-circles";
import paneStyles from "../global-pane-styles.module.css";
import { setSelectedMissionRightNavItem } from "store/mission";
import Equipment_Panel from "./mission-right-equipment";
import GeographicUnits_Panel from "./mission-right-geographicUnits";
import ActionTemplates_Panel from "./mission-right-actionTemplates";
import { RightTabs } from "components/interface/side-controls";
import Export_Panel from "./mission-right-export";
import ActionDefinitions_Panel from "./mission-right-actionDefinitions";
import MissionPriorities_Panel from "./mission-right-missionPriorities";
import { useMissionDocSelector } from "utils/useDocSelector";

const MissionPrefsRight: FunctionComponent = () => {
  const selectedRightNavItem = useAppSelector(
    (state) => state.mission.selectedRightNavItem,
    refEqual
  );
  const isInEditMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);

  // get the mission automerge document so we can get actionSystemVersion
  const actionSystemVersion = useMissionDocSelector(
    (mission) => mission.actionSystemVersion,
    refEqual
  );

  let panelTypes: PanelTypes;
  if (actionSystemVersion === 1) {
    panelTypes = {
      prefs_panel: {
        title: "Mission Preferences",
        panel: Prefs_panel,
        selectedColor: "white",
        icon: faSliders,
      },
      circle_panel: {
        title: "Proximity Circle Definitions",
        panel: Circles_panel,
        selectedColor: "white",
        icon: faBullseye,
      },
      actionTemplate_panel: {
        title: "Action Templates",
        panel: ActionTemplates_Panel,
        selectedColor: "white",
        icon: faPersonDigging,
      },
      geographicUnit_panel: {
        title: "Mission Geography",
        panel: GeographicUnits_Panel,
        selectedColor: "white",
        icon: faAtlas,
      },
      equipment_panel: {
        title: "Mission Equipment",
        panel: Equipment_Panel,
        selectedColor: "white",
        icon: faToolbox,
      },
      export_panel: {
        title: "Export AEGIS Data",
        panel: Export_Panel,
        selectedColor: "white",
        icon: faFileExport,
      },
    };
  } else {
    panelTypes = {
      prefs_panel: {
        title: "Mission Preferences",
        panel: Prefs_panel,
        selectedColor: "white",
        icon: faSliders,
      },
      circle_panel: {
        title: "Proximity Circle Definitions",
        panel: Circles_panel,
        selectedColor: "white",
        icon: faBullseye,
      },
      actionDefinitions_panel: {
        title: "STM Action Definitions",
        panel: ActionDefinitions_Panel,
        selectedColor: "white",
        icon: faUserGraduate,
      },
      missionPriorities_panel: {
        title: "Mission Priorities",
        panel: MissionPriorities_Panel,
        selectedColor: "white",
        icon: faListOl,
      },
      actionTemplate_panel: {
        title: "Action Templates",
        panel: ActionTemplates_Panel,
        selectedColor: "white",
        icon: faPersonDigging,
      },
      equipment_panel: {
        title: "Mission Equipment",
        panel: Equipment_Panel,
        selectedColor: "white",
        icon: faToolbox,
      },
      export_panel: {
        title: "Export AEGIS Data",
        panel: Export_Panel,
        selectedColor: "white",
        icon: faFileExport,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

  return (
    <>
      <div className={paneStyles.rightTopTitle} style={{ color: "var(--mission)" }}>
        <div className={paneStyles.rightTopTitleText}>Mission Configuration</div>
      </div>
      <div className={paneStyles.rightSubTray}>
        <RightTabs
          selectedRightNavItem={selectedRightNavItem}
          panelTypes={panelTypes}
          dispatchFunction={setSelectedMissionRightNavItem}
        />
      </div>
      <ActiveComponent className={paneStyles.rightActiveWindow} editMode={isInEditMode} />
    </>
  );
};

export default MissionPrefsRight;

import type { FunctionComponent } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import {
  faAtlas,
  faToolbox,
  faSliders,
  faBullseye,
  faFileExport,
  faUserGraduate,
  faPersonDigging,
} from "@fortawesome/free-solid-svg-icons";

import Prefs_panel from "./mission-right-prefs";
import Circles_panel from "./mission-right-circles";
import paneStyles from "../global-pane-styles.module.css";
import { ToggleButton } from "components/interface/form/globalFieldsAutomerge";
import { useAppDispatch } from "utils/useAppDispatch";
import { setMissionSectionEditing, setSelectedMissionRightNavItem } from "store/mission";
import Equipment_Panel from "./mission-right-equipment";
import GeographicUnits_Panel from "./mission-right-geographicUnits";
import ActionTemplates_Panel from "./mission-right-actionTemplates";
import { RightTabs } from "components/interface/side-controls";
import Export_Panel from "./mission-right-export";
import ActionDefinitions_Panel from "./mission-right-actionDefinitions";
import { useMissionDocSelector } from "utils/useDocSelector";
import { isConnected } from "store/selectors";

const MissionPrefsRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.mission.selectedRightNavItem,
    refEqual
  );
  const missionSectionsEditing = useAppSelector(
    (state) => state.mission.missionSectionsEditing?.includes("prefs"),
    shallowEqual
  );
  const editPerms = useAppSelector(
    (state) =>
      (state.user.missionPerms.permissions.edit && state.user.appUser.isAdmin) ||
      state.user.appUser.isSuperAdmin,
    refEqual
  );

  const isOnline = useAppSelector(isConnected, refEqual);

  // get the mission automerge document so we can get actionSystemVersion
  const actionSystemVersion = useMissionDocSelector((doc) => doc.actionSystemVersion, refEqual);

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
        <div className={paneStyles.saveCancelContainer}>
          {editPerms && (
            <ToggleButton
              toggled={missionSectionsEditing}
              isDisabled={!isOnline}
              onClick={() => {
                if (!isOnline) return;
                dispatch(
                  setMissionSectionEditing({
                    section: "prefs",
                    editMode: !missionSectionsEditing,
                  })
                );
              }}
              toolTip={
                isOnline
                  ? `Turn ${missionSectionsEditing ? "Off" : "On"} Edit Mode`
                  : "Offline: Editing Disabled"
              }
              label="Edit"
              toggleAriaLabel="missionEditToggle"
            />
          )}
        </div>
      </div>
      <ActiveComponent className={paneStyles.rightActiveWindow} editMode={missionSectionsEditing} />
    </>
  );
};

export default MissionPrefsRight;

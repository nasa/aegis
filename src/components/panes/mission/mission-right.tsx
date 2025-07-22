import { FunctionComponent, useState } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import {
  faAtlas,
  faBan,
  faEdit,
  faFloppyDisk,
  faToolbox,
  faSliders,
  faBullseye,
  faFileExport,
  faUserGraduate,
  faPersonDigging,
} from "@fortawesome/free-solid-svg-icons";

import Prefs_panel from "./mission-right-prefs";
import Layers_panel from "./mission-right-circles";
import paneStyles from "../global-pane-styles.module.css";
import { Button } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { setMissionSectionEditing, setSelectedMissionRightNavItem } from "store/mission";
import { thunkMissionCancel, thunkMissionSave } from "store/thunk/thunkMission";
import Equipment_Panel from "./mission-right-equipment";
import GeographiUnits_Panel from "./mission-right-geographicUnits";
import { isModified } from "utils/component-helpers";
import ActionTemplates_Panel from "./mission-right-actionTemplates";
import { RightTabs } from "components/interface/side-controls";
import Export_Panel from "./mission-right-export";
import ActionDefinitions_Panel from "./mission-right-actionDefinitions";
import { LoadingOverlay } from "components/interface/_global-elements";

const MissionPrefsRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.mission.selectedRightNavItem,
    refEqual
  );

  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

  const missionUpdatedAt = useAppSelector((state) => state.mission.mission.updatedAt, refEqual);
  const missionFromDbUpdatedAt = useAppSelector(
    (state) => state.mission.missionFromDb.updatedAt,
    refEqual
  );
  const missionSectionsEditing = useAppSelector(
    (state) => state.mission.missionSectionsEditing,
    shallowEqual
  );
  const editPerms = useAppSelector(
    (state) =>
      (state.user.missionPerms.permissions.edit && state.user.appUser.isAdmin) ||
      state.user.appUser.isSuperAdmin,
    refEqual
  );

  const modified = isModified(
    [{ updatedAt: missionUpdatedAt, uuid: null }],
    [{ updatedAt: missionFromDbUpdatedAt, uuid: null }]
  );
  // used for the loading overlay when saving a Mission
  const [isLoading, setIsLoading] = useState(false);

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
        panel: Layers_panel,
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
        panel: GeographiUnits_Panel,
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
        panel: Layers_panel,
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
          {!missionSectionsEditing.includes("prefs") && editPerms && (
            <Button
              icon={faEdit}
              onClick={() => {
                dispatch(setMissionSectionEditing({ section: "prefs", editMode: true }));
              }}
              label="Edit"
              toolTip="Edit Preset"
              style={{ width: "60px", fontSize: "0.9em" }}
              labelStyle={{ marginTop: "2px" }}
            />
          )}

          {missionSectionsEditing.includes("prefs") && (
            <>
              <Button
                onClick={async () => {
                  if (modified) {
                    setIsLoading(true); // Show loading overlay
                    try {
                      await dispatch(thunkMissionSave());
                    } finally {
                      setIsLoading(false); // Hide loading overlay
                    }
                  }
                }}
                icon={faFloppyDisk}
                toolTip={`Save Mission${modified ? "" : " (nothing to save)"}`}
                enabled={modified}
                ariaLabel="saveButton"
                style={{
                  width: "30px",
                  backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                  color: modified ? "white" : "var(--grey4)",
                  fontSize: "0.9em",
                  paddingLeft: "9px",
                }}
              />
              <Button
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    await dispatch(thunkMissionCancel());
                  } finally {
                    setIsLoading(false);
                  }
                }}
                icon={faBan}
                toolTip="Cancel Edit"
                ariaLabel="cancelButton"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "8px" }}
              />
            </>
          )}
        </div>
      </div>

      <ActiveComponent
        className={paneStyles.rightActiveWindow}
        editMode={missionSectionsEditing.includes("prefs")}
      />

      {isLoading && (
        <div>
          <LoadingOverlay message="Please Wait..." />
        </div>
      )}
    </>
  );
};

export default MissionPrefsRight;

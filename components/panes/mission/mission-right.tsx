import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import {
  faAtlas,
  faBan,
  faEdit,
  faFloppyDisk,
  faToolbox,
  faSliders,
  faBullseye,
  faPersonDigging,
  faFileExport,
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

const MissionPrefsRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.mission.selectedRightNavItem,
    refEqual
  );

  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const missionFromDb = useAppSelector((state) => state.mission.missionFromDb, shallowEqual);
  const missionSectionsEditing = useAppSelector(
    (state) => state.mission.missionSectionsEditing,
    refEqual
  );
  const editPerms = useAppSelector(
    (state) =>
      (state.user.missionPerms.permissions.edit && state.user.user.isAdmin) ||
      state.user.user.isSuperAdmin,
    refEqual
  );

  const [modified, setModified] = useState(false);

  useEffect(() => {
    setModified(isModified([{ ...mission, uuid: null }], [{ ...missionFromDb, uuid: null }]));
  }, [mission, missionFromDb]);

  const panelTypes: PanelTypes = {
    prefs_panel: {
      title: "Mission Preferences",
      panel: Prefs_panel,
      selectedColor: "white",
      icon: faSliders,
    },
    circle_panel: {
      title: "Map Vector Definitions",
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
    equipment_panel: {
      title: "Mission Equipment",
      panel: Equipment_Panel,
      selectedColor: "white",
      icon: faToolbox,
    },
    geographicUnit_panel: {
      title: "Mission Geography",
      panel: GeographiUnits_Panel,
      selectedColor: "white",
      icon: faAtlas,
    },
    export_panel: {
      title: "Export AEGIS Data",
      panel: Export_Panel,
      selectedColor: "white",
      icon: faFileExport,
    },
  };

  let ActiveComponent = null;
  if (selectedRightNavItem !== null) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

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
                onClick={() => {
                  if (modified) {
                    dispatch(thunkMissionSave());
                  }
                }}
                icon={faFloppyDisk}
                toolTip={`Save Mission${modified ? "" : " (nothing to save)"}`}
                enabled={modified}
                style={{
                  width: "30px",
                  backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                  color: modified ? "white" : "var(--grey4)",
                  fontSize: "0.9em",
                  paddingLeft: "10px",
                }}
              />
              <Button
                onClick={() => {
                  dispatch(thunkMissionCancel());
                }}
                icon={faBan}
                toolTip="Cancel Edit"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            </>
          )}
        </div>
      </div>

      <ActiveComponent
        className={paneStyles.rightActiveWindow}
        editMode={missionSectionsEditing.includes("prefs")}
      />
    </>
  );
};

export default MissionPrefsRight;

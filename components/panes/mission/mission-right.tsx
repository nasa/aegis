import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faEdit,
  faFloppyDisk,
  faPersonWalkingLuggage,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";

import Prefs_panel from "./mission-right-prefs";
import paneStyles from "../global-pane-styles.module.css";
import { Button } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { setMissionSectionEditing, setSelectedMissionRightNavItem } from "store/mission";
import { thunkMissionCancel, thunkMissionSave } from "store/thunk/thunkMission";
import Equipment_Panel from "./mission-right-equipment";

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
    setModified(!_.isEqual(mission, missionFromDb));
  }, [mission, missionFromDb]);

  const panelTypes: PanelTypes = {
    prefs_panel: {
      title: "Mission Preferences",
      panel: Prefs_panel,
      selectedColor: "white",
      icon: faSliders,
    },
    equipment_panel: {
      title: "Mission Equipment",
      panel: Equipment_Panel,
      selectedColor: "white",
      icon: faPersonWalkingLuggage,
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
        <div className={paneStyles.rightIconRow}>
          {Object.keys(panelTypes).map((panelType) => {
            return (
              <div
                key={panelType}
                className={
                  selectedRightNavItem === panelType
                    ? paneStyles.rightIconContainerSelectedPreset
                    : paneStyles.rightIconContainer
                }
              >
                <div
                  className={paneStyles.rightIcon}
                  style={{
                    color:
                      selectedRightNavItem === panelType
                        ? panelTypes[panelType].selectedColor
                        : "white",
                  }}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={panelTypes[panelType].title}
                  onClick={() => dispatch(setSelectedMissionRightNavItem(panelType))}
                >
                  <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                </div>
              </div>
            );
          })}
        </div>
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
                  dispatch(thunkMissionSave({}));
                }}
                icon={faFloppyDisk}
                toolTip={`Save Preset${modified ? "" : " (nothing to save)"}`}
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
                  dispatch(thunkMissionCancel({}));
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

import missionStyles from "./mission.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FunctionComponent } from "react";
import _ from "lodash";
import { setSelectedMissionRightNavItem } from "store/mission";
import { useDispatch } from "react-redux";

const MissionConfigLeft: FunctionComponent = () => {
  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={missionStyles.container}>
          <div className={missionStyles.body}>
            <MissionItem sectionName="prefs_panel" sectionTitle="Mission Preferences" />
          </div>
        </div>
      </div>
    </>
  );
};

export default MissionConfigLeft;

const MissionItem = ({
  sectionName,
  sectionTitle,
}: {
  sectionName: string;
  sectionTitle: string;
}) => {
  const dispatch = useDispatch();

  let missionSelectedStyle = null;
  if (sectionName === "prefs_panel") {
    missionSelectedStyle = missionStyles.nameSelected;
  }

  return (
    <div
      className={`${missionStyles.name} ${missionSelectedStyle}`}
      onClick={() => {
        dispatch(setSelectedMissionRightNavItem(sectionName));
      }}
    >
      <div>{sectionTitle}</div>
      <div className={missionStyles.rightSpacer}></div>
    </div>
  );
};

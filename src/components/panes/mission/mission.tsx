import missionStyles from "./mission.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FunctionComponent } from "react";
import { setSelectedMissionRightNavItem } from "store/mission";
import { useAppDispatch } from "utils/useAppDispatch";

const MissionConfigLeft: FunctionComponent = () => {
  return (
    <>
      <div
        className={paneStyles.activeComponentTitle}
        style={{ color: "var(--mission)" }}
        aria-label="leftPanelTitle"
      >
        Mission Configuration
      </div>
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
  const dispatch = useAppDispatch();

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

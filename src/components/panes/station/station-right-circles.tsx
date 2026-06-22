import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";

import Circles from "../../interface/circles";
import { useAppDispatch } from "utils/useAppDispatch";
import paneStyles from "../global-pane-styles.module.css";
import styles from "../../interface/circles.module.css";
import { setStationCircleUIState } from "store/station";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applyToggleStationCircleVisible,
  applyUpdateStationCircleStyle,
} from "client/automerge/apply/apply-station";

const Station_Circles_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const circleDefinitions = useMissionDocSelector(
    (mission) => mission.circleDefinitions,
    deepEqual
  );

  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const stations = useMissionDocSelector((mission) => mission.stations, shallowEqual);
  const mapCircleControls = useMemo(
    () => stations?.[selectedStationUuid]?.mapCircleControls,
    [stations, selectedStationUuid]
  );
  const circleUIStates = useAppSelector(
    (state) => state.station.stationCirclesUIStates[selectedStationUuid],
    shallowEqual
  );

  const circleUIStateSetterFunction = ({
    circleDefUuid,
    slidersSelected,
  }: {
    circleDefUuid: string;
    slidersSelected: boolean;
  }) => {
    dispatch(
      setStationCircleUIState({
        stationUuid: selectedStationUuid,
        circleDefUuid,
        circleUIState: {
          ...circleUIStates[circleDefUuid],
          slidersSelected,
        },
      })
    );
  };

  const toggleStationCircleVisibleHandler = ({ circleUuid }: { circleUuid: string }) => {
    withMissionChange((m) =>
      applyToggleStationCircleVisible(m, { stationUuid: selectedStationUuid, circleUuid })
    );
  };

  const styleSetterHandler = ({
    uuid,
    layerStyle,
  }: {
    uuid: string;
    layerStyle: MapSublayerStyle;
  }) => {
    withMissionChange((m) =>
      applyUpdateStationCircleStyle(m, {
        stationUuid: selectedStationUuid,
        circleUuid: uuid,
        layerStyle,
      })
    );
  };

  return (
    mapCircleControls && (
      <div className={paneStyles.rightBody}>
        <div className={paneStyles.rightBodyTitle}>Proximity Circles Display</div>
        <div className={paneStyles.rightBodyBody}>
          <div className={paneStyles.panelContainer}>
            <div className={styles.circlesContainer}>
              <div className={styles.circlesBody}>
                {circleDefinitions && circleUIStates && (
                  <Circles
                    editMode={editMode}
                    mapCircleControls={mapCircleControls}
                    toggleVisibleFunction={toggleStationCircleVisibleHandler}
                    circleUIStates={circleUIStates}
                    circleUIStateSetterFunction={circleUIStateSetterFunction}
                    styleSetter={styleSetterHandler}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  );
};

export default Station_Circles_Panel;

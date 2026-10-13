import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import { setPresetCircleUIState } from "store/preset";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applySetPresetCircleStyle,
  applyTogglePresetCircleVisible,
} from "operations/apply/apply-mission-preset";
import Circles from "../../interface/circles";
import { useAppDispatch } from "utils/useAppDispatch";
import paneStyles from "../global-pane-styles.module.css";
import styles from "../../interface/circles.module.css";
import { useMissionDocSelector } from "utils/useDocSelector";

const Preset_Circles_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const circleDefinitions = useMissionDocSelector(
    (mission) => mission.circleDefinitions,
    deepEqual
  );

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const mapCircleControls = useMissionDocSelector(
    (mission) => mission.presets?.[selectedPresetUuid]?.mapCircleControls,
    deepEqual
  );
  const storedPresetCircleUIStates = useAppSelector(
    (state) => state.preset.presetCirclesUIStates[selectedPresetUuid],
    shallowEqual
  );
  // A preset created by another user has no UI states in this store yet, so default each circle
  const presetCircleUIStates = useMemo(() => {
    const circleUIStatesWithDefaults: CircleUIStates = {};
    for (const circleDefUuid of Object.keys(circleDefinitions ?? {})) {
      circleUIStatesWithDefaults[circleDefUuid] = storedPresetCircleUIStates?.[circleDefUuid] ?? {
        slidersSelected: false,
      };
    }
    return circleUIStatesWithDefaults;
  }, [circleDefinitions, storedPresetCircleUIStates]);
  const circleUIStateSetterFunction = ({
    circleDefUuid,
    slidersSelected,
  }: {
    circleDefUuid: string;
    slidersSelected: boolean;
  }) => {
    dispatch(
      setPresetCircleUIState({
        presetUuid: selectedPresetUuid,
        circleDefUuid,
        circleUIState: {
          ...presetCircleUIStates[circleDefUuid],
          slidersSelected,
        },
      })
    );
  };

  const togglePresetCircleVisibleHandler = ({ circleUuid }: { circleUuid: string }) => {
    withMissionChange((m) =>
      applyTogglePresetCircleVisible(m, { presetUuid: selectedPresetUuid, circleUuid })
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
      applySetPresetCircleStyle(m, {
        presetUuid: selectedPresetUuid,
        circleDefUuid: uuid,
        style: layerStyle,
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
                {circleDefinitions && (
                  <Circles
                    editMode={editMode}
                    mapCircleControls={mapCircleControls}
                    toggleVisibleFunction={togglePresetCircleVisibleHandler}
                    circleUIStates={presetCircleUIStates}
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

export default Preset_Circles_Panel;

import { FunctionComponent } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import {
  setPresetCircleStyle,
  setPresetCircleUIState,
  togglePresetCircleVisible,
} from "store/preset";
import Circles from "../../interface/circles";
import { useAppDispatch } from "utils/useAppDispatch";
import paneStyles from "../global-pane-styles.module.css";
import styles from "../../interface/circles.module.css";
import { useMissionDocSelector } from "utils/useDocSelector";

const Preset_Circles_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const circleDefinitions = useMissionDocSelector((doc) => doc.circleDefinitions, deepEqual);

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const mapCircleControls = useAppSelector(
    (state) =>
      state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid)?.mapCircleControls,
    deepEqual
  );
  const presetCircleUIStates = useAppSelector(
    (state) => state.preset.presetCirclesUIStates[selectedPresetUuid],
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
    dispatch(
      togglePresetCircleVisible({
        presetUuid: selectedPresetUuid,
        circleUuid,
      })
    );
  };

  const styleSetterHandler = ({
    uuid,
    layerStyle,
  }: {
    uuid: string;
    layerStyle: MapSublayerStyle;
  }) => {
    dispatch(
      setPresetCircleStyle({
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
                {circleDefinitions && presetCircleUIStates && (
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

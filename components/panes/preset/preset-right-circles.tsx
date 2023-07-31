import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./preset-right-layers.module.css";
import { faEye, faEyeSlash, faSliders } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setPresetCircleUIState, togglePresetCircleVisible } from "store/preset";
import Settings_subpanel from "./preset-right-layers-settings";

const Layers_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    shallowEqual
  );
  const presetUIStates = useAppSelector(
    (state) => state.preset.presetsUIStates[selectedPresetUuid],
    shallowEqual
  );

  return (
    selectedPreset && (
      <div className={paneStyles.rightBody}>
        <div className={paneStyles.rightBodyTitle}>Vector Layer Configuration</div>
        <div className={paneStyles.rightBodyBody}>
          <div className={paneStyles.panelContainer}>
            <div className={styles.layersContainer}>
              <div className={styles.layersBody}>
                {mission?.landerRadii && presetUIStates && (
                  <div className={styles.layerGroup}>
                    <div className={styles.layer}>
                      <div>Circle Layers</div>
                    </div>
                    <div className={styles.sublayerGroup}>
                      {mission?.landerRadii &&
                        mission?.landerRadii.map((landerRadius: LanderRadius) => {
                          return (
                            selectedPreset.mapCircleControls[landerRadius.uuid] &&
                            presetUIStates[landerRadius.uuid] && (
                              <RadiusLayer
                                key={landerRadius.uuid}
                                radiusLayer={landerRadius}
                                selectedPreset={selectedPreset}
                                presetUIStates={presetUIStates}
                                editMode={editMode}
                              />
                            )
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  );
};

export default Layers_Panel;

const RadiusLayer: FunctionComponent<{
  radiusLayer: LanderRadius;
  selectedPreset: Preset;
  presetUIStates: PresetUIStates;
  editMode: boolean;
}> = ({ radiusLayer, selectedPreset, presetUIStates, editMode }) => {
  const dispatch = useAppDispatch();
  const presetCircleControls = selectedPreset?.mapCircleControls;

  return (
    <div className={styles.sublayerItemContainer}>
      <div
        className={`${styles.sublayer} ${
          selectedPreset.mapCircleControls[radiusLayer.uuid].visible || editMode
            ? null
            : styles.sublayerDisabled
        }`}
      >
        {editMode ? (
          <div
            className={styles.visibility}
            onClick={() => {
              if (!editMode) return;
              dispatch(
                togglePresetCircleVisible({
                  presetUuid: selectedPreset.uuid,
                  radiusUuid: radiusLayer.uuid,
                })
              );
            }}
          >
            {presetCircleControls[radiusLayer.uuid].visible ? (
              <div className={styles.visible}>
                <FontAwesomeIcon icon={faEye} size="xs" />
              </div>
            ) : (
              <div className={styles.inVisible}>
                <FontAwesomeIcon icon={faEyeSlash} size="xs" />
              </div>
            )}
          </div>
        ) : (
          <div className={styles.visibility} />
        )}
        <div className={styles.sublayerTitle}>{radiusLayer.name}</div>
        <div>{`${radiusLayer.radius}m`}</div>
        <div className={styles.sublayerRadiiToolIcons}>
          <div className={styles.sublayerToolIcon}></div>
          {editMode && (
            <div
              className={styles.radiusLayerToolIcon}
              onClick={() => {
                if (!editMode) return;
                const tabSelected =
                  presetUIStates[radiusLayer.uuid].tabSelected === "sliders" ? null : "sliders";
                dispatch(
                  setPresetCircleUIState({
                    presetUuid: selectedPreset.uuid,
                    radiusUuid: radiusLayer.uuid,
                    presetLayerUIState: {
                      ...presetUIStates[radiusLayer.name],
                      tabSelected,
                    },
                  })
                );
              }}
            >
              <FontAwesomeIcon icon={faSliders} />
            </div>
          )}
        </div>
      </div>
      {presetUIStates[radiusLayer.uuid].tabSelected === "sliders" && (
        <div className={styles.radiusLayerExpando}>
          <Settings_subpanel
            sublayer={{ ...radiusLayer, type: "circle" }}
            selectedPreset={selectedPreset}
            uuid={radiusLayer.uuid}
          />
        </div>
      )}
    </div>
  );
};

import { FunctionComponent, useEffect } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./preset-right-layers.module.css";
import {
  faCaretDown,
  faCaretRight,
  faCircleInfo,
  faEye,
  faEyeSlash,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setLayerControls } from "store/map";
import {
  setPresetInteraction,
  togglePresetInteractionLayerExpanded,
  togglePresetLayerControlEnabled,
} from "store/preset";
import Settings_subpanel from "./preset-right-layers-settings";
import Info_subpanel from "./preset-right-layers-info";

const Layers_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const missionLayers = useAppSelector((state) => state.mission.layers, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    shallowEqual
  );
  const allPresetInteractions = useAppSelector(
    (state) => state.preset.presetInteractions,
    shallowEqual
  );

  const presetLayerControls = selectedPreset?.layerControls;
  const presetLayerControlInteractions = allPresetInteractions[selectedPresetUuid];

  useEffect(() => {
    dispatch(setLayerControls(presetLayerControls));
  }, [dispatch, presetLayerControls]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Layer Configuration</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={styles.layersContainer}>
            <div className={styles.layersBody}>
              {missionLayers && selectedPreset ? (
                missionLayers.map((layer: Layer) => {
                  // Check if any of the sublayers in this label are enabled in this preset
                  let sublayerEnabled = false;
                  layer.layerConfig.sublayers?.forEach((sublayer: MMGIS_Sublayer) => {
                    if (presetLayerControls[sublayer.name].enabled) sublayerEnabled = true;
                  });
                  // show everything if in edit mode
                  if (editMode) sublayerEnabled = true;
                  return (
                    <div className={styles.layerGroup} key={layer.layerConfig.name}>
                      <div className={styles.layer}>
                        <div
                          className={`${styles.expandoCaret} ${
                            sublayerEnabled ? null : styles.expandoCaretDisabled
                          }`}
                          onClick={() =>
                            dispatch(
                              togglePresetInteractionLayerExpanded({
                                presetUuid: selectedPreset.uuid,
                                layerName: layer.layerConfig.name,
                              })
                            )
                          }
                        >
                          {presetLayerControlInteractions &&
                            (presetLayerControlInteractions[layer.layerConfig.name]?.expanded ? (
                              <FontAwesomeIcon icon={faCaretDown} size="sm" />
                            ) : (
                              <FontAwesomeIcon icon={faCaretRight} size="sm" />
                            ))}
                        </div>
                        <div className={sublayerEnabled ? null : styles.layerDisabled}>
                          {layer.layerConfig.name}
                        </div>
                      </div>
                      <div>
                        {presetLayerControlInteractions &&
                          presetLayerControlInteractions[layer.layerConfig.name]?.expanded &&
                          layer.layerConfig.sublayers &&
                          layer.layerConfig.sublayers.map((sublayer: Sublayer) => {
                            return (
                              <Sublayer
                                key={`sub_${sublayer.name}`}
                                sublayer={sublayer}
                                selectedPreset={selectedPreset}
                                presetLayerControlInteractions={presetLayerControlInteractions}
                                editMode={editMode}
                              />
                            );
                          })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div>
                  {/* <FontAwesomeIcon icon={faCircleNotch} spin />
              &nbsp; Loading... */}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layers_Panel;

const Sublayer: FunctionComponent<{
  sublayer: Sublayer;
  selectedPreset: Preset;
  presetLayerControlInteractions: LayerControlInteractions;
  editMode: boolean;
}> = ({ sublayer, selectedPreset, presetLayerControlInteractions, editMode }) => {
  const dispatch = useDispatch();
  const presetLayerControls = selectedPreset?.layerControls;

  return (
    <div className={styles.sublayerItemContainer}>
      <div
        className={`${styles.sublayer} ${
          selectedPreset.layerControls[sublayer.name].enabled || editMode
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
                togglePresetLayerControlEnabled({
                  presetUuid: selectedPreset.uuid,
                  layerName: sublayer.name,
                })
              );
            }}
          >
            {presetLayerControls[sublayer.name].enabled ? (
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
        <div className={styles.sublayerTitle}>
          {sublayer.name} ({sublayer.type})
        </div>
        <div className={styles.sublayerToolIcons}>
          <div
            className={`${styles.sublayerToolIcon} ${
              selectedPreset.layerControls[sublayer.name].enabled || editMode
                ? null
                : styles.sublayerDisabled
            }`}
            onClick={() => {
              const tabSelected =
                presetLayerControlInteractions[sublayer.name].tabSelected === "info"
                  ? null
                  : "info";
              dispatch(
                setPresetInteraction({
                  presetUuid: selectedPreset.uuid,
                  layerName: sublayer.name,
                  layerControlInteraction: {
                    ...presetLayerControlInteractions[sublayer.name],
                    tabSelected,
                  },
                })
              );
            }}
          >
            <FontAwesomeIcon icon={faCircleInfo} />
          </div>
          {editMode && (
            <div
              className={styles.sublayerToolIcon}
              onClick={() => {
                if (!editMode) return;
                const tabSelected =
                  presetLayerControlInteractions[sublayer.name].tabSelected === "sliders"
                    ? null
                    : "sliders";
                dispatch(
                  setPresetInteraction({
                    presetUuid: selectedPreset.uuid,
                    layerName: sublayer.name,
                    layerControlInteraction: {
                      ...presetLayerControlInteractions[sublayer.name],
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

      {presetLayerControlInteractions[sublayer.name].tabSelected === "info" && (
        <div
          className={`${styles.sublayerExpando} ${
            selectedPreset.layerControls[sublayer.name].enabled || editMode
              ? null
              : styles.sublayerDisabled
          }`}
        >
          <Info_subpanel sublayer={sublayer} />
        </div>
      )}
      {presetLayerControlInteractions[sublayer.name].tabSelected === "sliders" && (
        <div className={styles.sublayerExpando}>
          <Settings_subpanel sublayer={sublayer} selectedPreset={selectedPreset} />
        </div>
      )}
    </div>
  );
};

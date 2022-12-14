import { FunctionComponent, useEffect } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./preset-right-layers-panel.module.css";
import {
  faCaretDown,
  faCaretRight,
  faEye,
  faEyeSlash,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setLayerControls } from "store/map";
import {
  setPresetInteraction,
  togglePresetInteractionLayerExpanded,
  togglePresetLayerControlEnabled,
} from "store/preset";
import Settings_subpanel from "./preset-right-settings-subpanel";

const Layers_Panel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const missionState = useSelector((state: RootState) => state.mission);
  const selectedPresetUuid = useSelector(
    (state: RootState) => state.preset.selectedPresetUuid,
    shallowEqual
  );
  const selectedPreset: Preset = useSelector(
    (state: RootState) =>
      state.preset.presets.filter((preset) => preset.uuid === selectedPresetUuid)[0],
    shallowEqual
  );
  const allPresetInteractions = useSelector((state: RootState) => state.preset.presetInteractions);

  const presetLayerControls = selectedPreset?.layerControls;
  const presetLayerControlInteractions = allPresetInteractions[selectedPreset.uuid];

  useEffect(() => {
    dispatch(setLayerControls(presetLayerControls));
  }, [dispatch, presetLayerControls]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Layer Configuration</div>
      <div className={paneStyles.panelContainer}>
        <div className={styles.layersContainer}>
          <div className={styles.layersBody}>
            {missionState && selectedPreset ? (
              missionState?.layers.map((layer: Layer) => {
                return (
                  <div className={styles.layerGroup} key={layer.layerConfig.name}>
                    <div className={styles.layer}>
                      <div
                        className={styles.expandoCaret}
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
                          (presetLayerControlInteractions[layer.layerConfig.name].expanded ? (
                            <FontAwesomeIcon icon={faCaretDown} size="sm" />
                          ) : (
                            <FontAwesomeIcon icon={faCaretRight} size="sm" />
                          ))}
                      </div>
                      <div>{layer.layerConfig.name}</div>
                    </div>
                    <div>
                      {presetLayerControlInteractions &&
                        presetLayerControlInteractions[layer.layerConfig.name].expanded &&
                        layer.layerConfig.sublayers &&
                        layer.layerConfig.sublayers.map((sublayer: MMGIS_Sublayer) => {
                          return (
                            <Sublayer
                              key={`sub_${sublayer.name}`}
                              sublayer={sublayer}
                              selectedPreset={selectedPreset}
                              presetLayerControlInteractions={presetLayerControlInteractions}
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
  );
};

export default Layers_Panel;

const Sublayer: FunctionComponent<{
  sublayer: MMGIS_Sublayer;
  selectedPreset: Preset;
  presetLayerControlInteractions: LayerControlInteractions;
}> = ({ sublayer, selectedPreset, presetLayerControlInteractions }) => {
  const dispatch = useDispatch();
  const presetLayerControls = selectedPreset?.layerControls;

  return (
    <div className={styles.sublayerItemContainer}>
      <div key={`sub_${sublayer.name}`} className={styles.sublayer}>
        <div
          className={styles.visibility}
          onClick={() => {
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
        <div className={styles.sublayerTitle}>
          {sublayer.name} ({sublayer.type})
        </div>
        <div className={styles.sublayerToolIcons}>
          {/* <div
            className={styles.sublayerToolIcon}
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
          </div> */}
          <div
            className={styles.sublayerToolIcon}
            onClick={() => {
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
        </div>
      </div>

      {presetLayerControlInteractions[sublayer.name].tabSelected === "info" && (
        <div className={styles.sublayerInfo}>
          <p>Info</p>
        </div>
      )}
      {presetLayerControlInteractions[sublayer.name].tabSelected === "sliders" && (
        <div className={styles.sublayerSliders}>
          <Settings_subpanel sublayer={sublayer} selectedPreset={selectedPreset} />
        </div>
      )}
    </div>
  );
};

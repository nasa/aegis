import styles from "./map_selector.module.css";
import paneStyles from "../global_pane_styles.module.css";
import { FunctionComponent, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import { toggleLayerControlExpanded, toggleLayerControlEnabled } from "store/map";
import SystemMapImageryPresets from "./_system_imagery_presets";
import UserMapImageryPresets from "./_user_imagery_presets";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faEye,
  faEyeSlash,
  faCircleInfo,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";

const MapSelector: FunctionComponent = () => {
  const aegisState = useSelector((state: RootState) => state.missionSlice);
  const layerControls = useSelector((state: RootState) => state.map?.layerControls);
  const [expandedSections, setExpandedSections] = useState({
    systemPresets: true,
    userPresets: false,
    details: true,
  });

  return (
    <>
      <SystemMapImageryPresets
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
      />
      <UserMapImageryPresets
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
      />
      <DetailedSettings
        aegisState={aegisState}
        layerControls={layerControls}
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
      />
    </>
  );
};

export default MapSelector;

const DetailedSettings = ({ aegisState, layerControls, expandedSections, setExpandedSections }) => {
  const dispatch = useDispatch();
  const [layerHover, setLayerHover] = useState<string | null>(null);

  const toggleSublayerEnabled = (sublayer: Sublayer) => {
    dispatch(toggleLayerControlEnabled(sublayer.name));
  };

  const toggleLayerExpanded = (layer: MMGISLayer) => {
    dispatch(toggleLayerControlExpanded(layer.name));
  };

  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.layersContainer}>
        <div
          className={styles.layersHeader}
          onClick={() =>
            setExpandedSections({ ...expandedSections, details: !expandedSections.details })
          }
        >
          <div className={styles.expandoCaret}>
            {expandedSections.details ? (
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            ) : (
              <FontAwesomeIcon icon={faCaretRight} size="sm" />
            )}
          </div>
          <div>Imagery Details & Settings</div>
        </div>
        <div className={styles.layersBody}>
          {aegisState && layerControls && expandedSections.details ? (
            aegisState?.Layers.map((layer: LayerModel) => {
              return (
                <div className={styles.layerGroup} key={layer.config.name}>
                  <div className={styles.layer}>
                    <div
                      className={styles.expandoCaret}
                      onClick={() => toggleLayerExpanded(layer.config)}
                    >
                      {layerControls &&
                        (layerControls[layer.config.name].expanded ? (
                          <FontAwesomeIcon icon={faCaretDown} size="sm" />
                        ) : (
                          <FontAwesomeIcon icon={faCaretRight} size="sm" />
                        ))}
                    </div>
                    <div className={styles.layerName}>{layer.config.name}</div>
                  </div>
                  <div className={styles.layerSublayers}>
                    {layerControls &&
                      layerControls[layer.config.name].expanded &&
                      layer.config.sublayers &&
                      layer.config.sublayers.map((sublayer: Sublayer) => {
                        return (
                          <div
                            key={`sub_${sublayer.name}`}
                            className={styles.sublayer}
                            onClick={() => toggleSublayerEnabled(sublayer)}
                            onMouseOver={() => {
                              setLayerHover(sublayer.name);
                            }}
                            onMouseOut={() => {
                              setLayerHover(null);
                            }}
                          >
                            <Visibility visible={layerControls[sublayer.name].enabled} />
                            <div className={styles.sublayerTitle}>
                              {sublayer.name} ({sublayer.type})
                            </div>
                            {layerHover === sublayer.name && (
                              <div className={styles.sublayerToolIcons}>
                                <div className={styles.sublayerToolIcon}>
                                  <FontAwesomeIcon icon={faSliders} />
                                </div>
                                <div className={styles.sublayerToolIcon}>
                                  <FontAwesomeIcon icon={faCircleInfo} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })
          ) : (
            <div>
              <FontAwesomeIcon icon="circle-notch" spin />
              &nbsp; Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Visibility = ({ visible }) => {
  return (
    <div className={styles.visibility}>
      {visible ? (
        <div className={styles.visible}>
          <FontAwesomeIcon icon={faEye} size="xs" />
        </div>
      ) : (
        <div className={styles.inVisible}>
          <FontAwesomeIcon icon={faEyeSlash} size="xs" />
        </div>
      )}
    </div>
  );
};

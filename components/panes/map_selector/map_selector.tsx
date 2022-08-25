import styles from "./map_selector.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { useState } from "react";
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
import { library } from "@fortawesome/fontawesome-svg-core";

library.add(faCaretDown, faCaretRight, faEye, faEyeSlash, faCircleInfo, faSliders);

export default function MapSelector() {
  // const dispatch = useDispatch();
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);

  const [expandedSections, setExpandedSections] = useState({
    systemPresets: true,
    userPresets: false,
    details: false,
  });

  // TODO: remove this
  // const testHalfOpacity = (layer: Sublayer) => {
  //   dispatch(setLayerOpacity({ layerName: layer.name, opacity: 0.5 }));
  // };

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
        mmgisConfig={mmgisConfig}
        layerControls={layerControls}
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
      />
    </>
  );
}

const DetailedSettings = ({
  mmgisConfig,
  layerControls,
  expandedSections,
  setExpandedSections,
}) => {
  const dispatch = useDispatch();
  const [layerHover, setLayerHover] = useState<string | null>(null);

  const toggleSublayerEnabled = (sublayer: Sublayer) => {
    dispatch(toggleLayerControlEnabled(sublayer.name));
  };

  const toggleLayerExpanded = (layer: Layer) => {
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
              <FontAwesomeIcon icon="caret-down" size="sm" />
            ) : (
              <FontAwesomeIcon icon="caret-right" size="sm" />
            )}
          </div>
          <div>Map Imagery Detailed Settings</div>
        </div>
        <div className={styles.layersBody}>
          {mmgisConfig &&
            layerControls &&
            expandedSections.details &&
            mmgisConfig?.MMGISConfig?.config?.layers?.map((configLayer: Layer) => {
              return (
                <div className={styles.layerGroup} key={configLayer.name}>
                  <div className={styles.layer}>
                    <div
                      className={styles.expandoCaret}
                      onClick={() => toggleLayerExpanded(configLayer)}
                    >
                      {layerControls &&
                        (layerControls[configLayer.name].expanded ? (
                          <FontAwesomeIcon icon="caret-down" size="sm" />
                        ) : (
                          <FontAwesomeIcon icon="caret-right" size="sm" />
                        ))}
                    </div>
                    <div className={styles.layerName}>{configLayer.name}</div>
                  </div>
                  <div className={styles.layerSublayers}>
                    {layerControls &&
                      layerControls[configLayer.name].expanded &&
                      configLayer.sublayers &&
                      configLayer.sublayers.map((sublayer: Sublayer) => {
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
                                  <FontAwesomeIcon icon="sliders" />
                                </div>
                                <div className={styles.sublayerToolIcon}>
                                  <FontAwesomeIcon icon="circle-info" />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
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
          <FontAwesomeIcon icon="eye" size="xs" />
        </div>
      ) : (
        <div className={styles.inVisible}>
          <FontAwesomeIcon icon="eye-slash" size="xs" />
        </div>
      )}
    </div>
  );
};

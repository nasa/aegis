import styles from "./map_layer_selector.module.css";
import paneStyles from "./left_pane_styles.module.css";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import { toggleLayerControlExpanded, toggleLayerControlEnabled } from "store/map";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";
import { useState } from "react";

library.add(faCaretDown, faCaretRight, faEye, faEyeSlash);

const MapLayerSelector = () => {
  const dispatch = useDispatch();
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);

  const [expandedSections, setExpandedSections] = useState({
    details: true,
  });

  const toggleSublayerEnabled = (sublayer: Sublayer) => {
    dispatch(toggleLayerControlEnabled(sublayer.name));
  };

  const toggleLayerExpanded = (layer: Layer) => {
    dispatch(toggleLayerControlExpanded(layer.name));
  };

  // TODO: remove this
  // const testHalfOpacity = (layer: Sublayer) => {
  //   dispatch(setLayerOpacity({ layerName: layer.name, opacity: 0.5 }));
  // };

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
                      configLayer.sublayers &&
                      configLayer.sublayers.map((sublayer: Sublayer) => {
                        if (layerControls[configLayer.name].expanded) {
                          return (
                            <div
                              key={`sub_${sublayer.name}`}
                              className={styles.sublayer}
                              onClick={() => toggleSublayerEnabled(sublayer)}
                            >
                              <Visibility visible={layerControls[sublayer.name].enabled} />
                              <div>
                                {sublayer.name} ({sublayer.type})
                              </div>
                            </div>
                          );
                        } else {
                          return null;
                        }
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

export default MapLayerSelector;

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

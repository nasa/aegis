import styles from "./left-control.module.css";
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faLayerGroup, faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RootState } from "store";
import {
  setLayerControls,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  setLayerOpacity,
} from "store/user";

library.add(faLayerGroup, faCaretDown, faCaretRight);

const LeftControlPanel = () => {
  return (
    <div className={styles.body}>
      <div className={styles.iconGutter}>
        <div className={styles.icon}>
          <FontAwesomeIcon icon="layer-group" />
        </div>
      </div>
      <div className={styles.activeComponent}>
        <LayerSelector />
      </div>
    </div>
  );
};

export default LeftControlPanel;

const LayerSelector = () => {
  const dispatch = useDispatch();
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);
  const layerControls = useSelector((state: RootState) => state.user.layerControls);

  useEffect(() => {
    if (!mmgisConfig) return;
    const configLayers = mmgisConfig?.MMGISConfig?.config?.layers;

    if (!configLayers) return;

    const controls: LayerControls = {};

    /**
     * Make configLayer store
     */
    configLayers.map((configLayer) => {
      const layerControl: LayerControl = {
        name: configLayer.name,
        enabled: false,
        type: configLayer.type,
        expanded: false,
        mapLayerRef: null,
        opacity: 1,
      };
      controls[configLayer.name] = layerControl;
      if (configLayer.sublayers) {
        configLayer.sublayers.map((sublayer) => {
          const layerControl: LayerControl = {
            name: sublayer.name,
            enabled: false,
            type: sublayer.type,
            expanded: false,
            mapLayerRef: null,
            opacity: 1,
          };
          controls[sublayer.name] = layerControl;
        });
      }
    });
    dispatch(setLayerControls(controls));
  }, [mmgisConfig, dispatch]);

  const toggleSublayerEnabled = (sublayer: Sublayer) => {
    dispatch(toggleLayerControlEnabled(sublayer.name));
  };

  const toggleLayerEnabled = (layer: Layer) => {
    dispatch(toggleLayerControlEnabled(layer.name));
    layer.sublayers.map((sublayer) => {
      dispatch(toggleLayerControlEnabled(sublayer.name));
    });
  };

  const toggleLayerExpanded = (layer: Layer) => {
    dispatch(toggleLayerControlExpanded(layer.name));
  };

  // TODO: remove this
  const testHalfOpacity = (layer: Sublayer) => {
    dispatch(setLayerOpacity({ layerName: layer.name, opacity: 0.5 }));
  };

  return (
    <>
      <div className={styles.layersContainer}>
        {mmgisConfig &&
          layerControls &&
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
                        <FontAwesomeIcon icon="caret-down" />
                      ) : (
                        <FontAwesomeIcon icon="caret-right" />
                      ))}
                  </div>
                  <input
                    type="checkbox"
                    key={`checkbox_${configLayer.name}`}
                    checked={layerControls[configLayer.name].enabled}
                    onChange={() => toggleLayerEnabled(configLayer)}
                  />
                  <div className={styles.layerName}>{configLayer.name}</div>
                </div>
                <div className={styles.layerSublayers}>
                  {layerControls &&
                    configLayer.sublayers &&
                    configLayer.sublayers.map((sublayer: Sublayer) => {
                      if (layerControls[configLayer.name].expanded) {
                        return (
                          <div key={`checkbox_${sublayer.name}`} className={styles.layerSublayer}>
                            <div className={styles.sublayer}>
                              <input
                                type="checkbox"
                                checked={layerControls[sublayer.name].enabled}
                                onChange={() => toggleSublayerEnabled(sublayer)}
                              />
                              <div
                                onClick={() => {
                                  testHalfOpacity(sublayer);
                                }}
                              >
                                {sublayer.name} ({sublayer.type})
                              </div>
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
    </>
  );
};

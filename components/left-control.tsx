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
    const layers = mmgisConfig?.MMGISConfig?.config?.layers;

    if (!layers) return;

    const controls: LayerControls = {};

    layers.map((layer) => {
      const layerControl: LayerControl = {
        name: layer.name,
        enabled: false,
        type: layer.type,
        expanded: false,
      };
      controls[layer.name] = layerControl;
      if (layer.sublayers) {
        layer.sublayers.map((sublayer) => {
          const layerControl: LayerControl = {
            name: sublayer.name,
            enabled: false,
            type: sublayer.type,
            expanded: false,
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

  return (
    <>
      <div className={styles.layersContainer}>
        {mmgisConfig &&
          mmgisConfig?.MMGISConfig?.config?.layers?.map((layer: Layer) => {
            return (
              <div className={styles.layerGroup} key={layer.name}>
                <div className={styles.layer}>
                  <div className={styles.expandoCaret} onClick={() => toggleLayerExpanded(layer)}>
                    {layerControls &&
                      (layerControls[layer.name].expanded ? (
                        <FontAwesomeIcon icon="caret-down" />
                      ) : (
                        <FontAwesomeIcon icon="caret-right" />
                      ))}
                  </div>
                  {layerControls && (
                    <input
                      type="checkbox"
                      key={layer.name}
                      checked={layerControls[layer.name].enabled}
                      onChange={() => toggleLayerEnabled(layer)}
                    />
                  )}
                  <div className={styles.layerName}>{layer.name}</div>
                </div>
                <div className={styles.layerSublayers}>
                  {layerControls &&
                    layer.sublayers &&
                    layer.sublayers.map((sublayer: Sublayer) => {
                      if (layerControls[layer.name].expanded) {
                        return (
                          <>
                            <div className={styles.layerSublayer} key={sublayer.name}>
                              <div className={styles.sublayer}>
                                {layerControls && (
                                  <input
                                    type="checkbox"
                                    key={sublayer.name}
                                    checked={layerControls[sublayer.name].enabled}
                                    onChange={() => toggleSublayerEnabled(sublayer)}
                                  />
                                )}
                                <div>
                                  {sublayer.name} ({sublayer.type})
                                </div>{" "}
                              </div>
                            </div>
                          </>
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

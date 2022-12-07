import styles from "./map.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FunctionComponent, MouseEventHandler, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import {
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  setActiveSelectedName,
  setSelectedRightNavItem,
  setActiveSelectedUUID,
  setActiveSelectedType,
} from "store/map";
import SystemMapImageryPresets from "./map-system-presets";
import PresetList from "./map-user-presets";

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
  const missionState = useSelector((state: RootState) => state.mission);
  const layerControls = useSelector((state: RootState) => state.map?.layerControls);
  const [expandedSections, setExpandedSections] = useState<MapExpandedSections>({
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
      <PresetList expandedSections={expandedSections} setExpandedSections={setExpandedSections} />
      <DetailedSettings
        missionState={missionState}
        layerControls={layerControls}
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
      />
    </>
  );
};

export default MapSelector;

const DetailedSettings: FunctionComponent<{
  missionState: MissionState;
  layerControls: LayerControls;
  expandedSections: MapExpandedSections;
  setExpandedSections: any;
}> = ({ missionState, layerControls, expandedSections, setExpandedSections }) => {
  const dispatch = useDispatch();
  const [layerHover, setLayerHover] = useState<string | null>(null);
  const activeLayerName = useSelector((state: RootState) => state.map.activeSelectedName);

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
          {missionState && layerControls && expandedSections.details ? (
            missionState?.layers.map((layer: AEGISLayer) => {
              return (
                <div className={styles.layerGroup} key={layer.config.name}>
                  <div className={styles.layer}>
                    <div
                      className={styles.expandoCaret}
                      onClick={() => dispatch(toggleLayerControlExpanded(layer.config.name))}
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
                        const selectedStyle =
                          sublayer.name === activeLayerName ? styles.selected : styles.normal;
                        return (
                          <div
                            key={`sub_${sublayer.name}`}
                            className={selectedStyle}
                            onMouseOver={() => {
                              setLayerHover(sublayer.name);
                            }}
                            onMouseOut={() => {
                              setLayerHover(null);
                            }}
                          >
                            <Visibility
                              visible={layerControls[sublayer.name].enabled}
                              onClick={() => {
                                dispatch(toggleLayerControlEnabled(sublayer.name));
                                dispatch(setActiveSelectedUUID(layer.uuid));
                              }}
                            />
                            <div
                              className={styles.sublayerTitle}
                              onClick={() => {
                                dispatch(setActiveSelectedName(sublayer.name));
                                dispatch(setActiveSelectedUUID(layer.uuid));
                                dispatch(setActiveSelectedType("layer"));
                                dispatch(setSelectedRightNavItem("settings_panel"));
                              }}
                            >
                              {sublayer.name} ({sublayer.type}) {layer.uuid}
                            </div>
                            {layerHover === sublayer.name && (
                              <div className={styles.sublayerToolIcons}>
                                <div
                                  className={styles.sublayerToolIcon}
                                  onClick={() => {
                                    dispatch(setActiveSelectedName(sublayer.name));
                                    dispatch(setActiveSelectedUUID(layer.uuid));
                                    dispatch(setActiveSelectedType("layer"));
                                    dispatch(setSelectedRightNavItem("information_panel"));
                                  }}
                                >
                                  <FontAwesomeIcon icon={faCircleInfo} />
                                </div>
                                <div
                                  className={styles.sublayerToolIcon}
                                  onClick={() => {
                                    dispatch(setActiveSelectedName(sublayer.name));
                                    dispatch(setActiveSelectedUUID(layer.uuid));
                                    dispatch(setActiveSelectedType("layer"));
                                    dispatch(setSelectedRightNavItem("settings_panel"));
                                  }}
                                >
                                  <FontAwesomeIcon icon={faSliders} />
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
              {/* <FontAwesomeIcon icon={faCircleNotch} spin />
              &nbsp; Loading... */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Visibility: FunctionComponent<{
  visible: boolean;
  onClick: MouseEventHandler<HTMLDivElement>;
}> = ({ visible, onClick }) => {
  return (
    <div className={styles.visibility} onClick={onClick}>
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

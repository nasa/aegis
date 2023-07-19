import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./preset-right-layers.module.css";
import {
  faCaretDown,
  faCaretRight,
  faCircleInfo,
  faEye,
  faEyeSlash,
  faGripVertical,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setMapLayerControls } from "store/map";
import {
  setPresetLayerUIState,
  togglePresetUIStateLayerExpanded,
  togglePresetLayerVisible,
  upsertPreset,
} from "store/preset";
import Settings_subpanel from "./preset-right-layers-settings";
import Info_subpanel from "./preset-right-layers-info";
import ReactDragListView from "react-drag-listview";
import { cloneDeep } from "lodash";

const Layers_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const missionLayers = useAppSelector((state) => state.mission.layers, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    shallowEqual
  );
  const presetUIStates = useAppSelector(
    (state) => state.preset.presetsUIStates[selectedPresetUuid],
    shallowEqual
  );
  const presetMapLayerControls = selectedPreset?.mapLayerControls;
  const [orderedLayerUuids, setOrderedLayerUuids] = useState<PresetLayerOrder[]>(null); //contains all actions in order

  useEffect(() => {
    //if no ordering is defined, use default from mission
    if (selectedPreset?.layerOrder) {
      setOrderedLayerUuids(selectedPreset.layerOrder);
    } else {
      const defaultOrder = missionLayers.map((headerLayer) => {
        const presetLayerOrder: PresetLayerOrder = {
          headerLayerUuid: headerLayer.uuid,
          sublayerUuids: [],
        };
        headerLayer.layerConfig.sublayers.forEach((sublayer) => {
          presetLayerOrder.sublayerUuids.push(sublayer.uuid); //add sublayers
        });
        return presetLayerOrder;
      });
      setOrderedLayerUuids(defaultOrder);
    }
  }, [selectedPreset, missionLayers]);

  useEffect(() => {
    dispatch(setMapLayerControls(presetMapLayerControls));
  }, [dispatch, presetMapLayerControls]);

  //reorder header layers and then upsert to preset
  function reorderHeader(fromIndex: number, toIndex: number) {
    const newOrder = cloneDeep(orderedLayerUuids);
    const headerLayerBeingMoved = newOrder.splice(fromIndex, 1)[0]; //remove header layer
    newOrder.splice(toIndex, 0, headerLayerBeingMoved); //reinsert in new position
    dispatch(upsertPreset({ ...selectedPreset, layerOrder: newOrder }));
  }

  //reorder sublayers and then upsert to preset
  function reorderSublayer(fromIndex: number, toIndex: number, headerUuid: string) {
    const newOrder = cloneDeep(orderedLayerUuids);
    const headerLayer = newOrder.find(
      (headerLayers) => headerLayers.headerLayerUuid === headerUuid
    );
    const headerLayerBeingMoved = headerLayer.sublayerUuids.splice(fromIndex, 1)[0]; //remove header layer
    headerLayer.sublayerUuids.splice(toIndex, 0, headerLayerBeingMoved); //reinsert in new position
    dispatch(upsertPreset({ ...selectedPreset, layerOrder: newOrder }));
  }

  return (
    selectedPreset && (
      <div className={paneStyles.rightBody}>
        <div className={paneStyles.rightBodyTitle}>Preset Layer Configuration</div>
        <div className={paneStyles.rightBodyBody}>
          <div className={paneStyles.panelContainer}>
            <div className={styles.layersContainer}>
              <div className={styles.layersBody}>
                {missionLayers && presetUIStates && orderedLayerUuids && (
                  <ReactDragListView
                    onDragEnd={reorderHeader}
                    nodeSelector={`div.${styles.layerGroup}`}
                    handleSelector="a.headerReorder"
                  >
                    {orderedLayerUuids.map((presetLayerOrder: PresetLayerOrder) => {
                      //loop through layers in order
                      const headerLayer: Layer = missionLayers.find(
                        (layer) => layer.uuid === presetLayerOrder.headerLayerUuid
                      );

                      // Check if any of the sublayers are visible in this preset (for styling)
                      let sublayerVisible = false;
                      if (editMode) {
                        sublayerVisible = true; // show everything if in edit mode
                      } else {
                        //check if any of the sublayers are visible
                        headerLayer.layerConfig.sublayers?.forEach((sublayer: MMGIS_Sublayer) => {
                          if (presetMapLayerControls[sublayer.name].visible) sublayerVisible = true;
                        });
                      }
                      return (
                        <div className={styles.layerGroup} key={headerLayer.layerConfig.name}>
                          <div className={styles.layer}>
                            {editMode && (
                              <a className="headerReorder">
                                <FontAwesomeIcon
                                  icon={faGripVertical}
                                  className={styles.reorderIcon}
                                  size="sm"
                                />
                              </a>
                            )}
                            <div
                              className={`${sublayerVisible ? null : styles.expandoCaretDisabled}`}
                              onClick={() =>
                                dispatch(
                                  togglePresetUIStateLayerExpanded({
                                    presetUuid: selectedPreset.uuid,
                                    layerName: headerLayer.layerConfig.name,
                                  })
                                )
                              }
                            >
                              {presetUIStates[headerLayer.layerConfig.name]?.expanded ? (
                                <FontAwesomeIcon icon={faCaretDown} size="sm" />
                              ) : (
                                <FontAwesomeIcon icon={faCaretRight} size="sm" />
                              )}
                            </div>
                            <div className={sublayerVisible ? null : styles.layerDisabled}>
                              {headerLayer.layerConfig.name}
                            </div>
                          </div>
                          <ReactDragListView
                            onDragEnd={(fromIndex, toIndex) =>
                              reorderSublayer(fromIndex, toIndex, presetLayerOrder.headerLayerUuid)
                            }
                            nodeSelector={`div.${styles.sublayerItemContainer}`}
                            handleSelector="a.sublayerReorder"
                          >
                            <div className={styles.sublayerGroup}>
                              {presetUIStates[headerLayer.layerConfig.name]?.expanded &&
                                headerLayer.layerConfig.sublayers &&
                                presetLayerOrder.sublayerUuids.map((sublayerUuid: string) => {
                                  const sublayer = headerLayer.layerConfig.sublayers.find(
                                    (sublayer) => sublayer.uuid === sublayerUuid
                                  );
                                  return (
                                    <Sublayer
                                      key={`sub_${sublayer.name}`}
                                      sublayer={sublayer}
                                      selectedPreset={selectedPreset}
                                      presetUIStates={presetUIStates}
                                      editMode={editMode}
                                    />
                                  );
                                })}
                            </div>
                          </ReactDragListView>
                        </div>
                      );
                    })}
                  </ReactDragListView>
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

const Sublayer: FunctionComponent<{
  sublayer: Sublayer;
  selectedPreset: Preset;
  presetUIStates: PresetUIStates;
  editMode: boolean;
}> = ({ sublayer, selectedPreset, presetUIStates, editMode }) => {
  const dispatch = useAppDispatch();
  const presetLayerControls = selectedPreset?.mapLayerControls;

  return (
    <div className={styles.sublayerItemContainer}>
      <div
        className={`${styles.sublayer} ${
          selectedPreset.mapLayerControls[sublayer.name].visible || editMode
            ? null
            : styles.sublayerDisabled
        }`}
      >
        {editMode && (
          <a className="sublayerReorder">
            <FontAwesomeIcon
              icon={faGripVertical}
              className={styles.reorderIconSublayer}
              size="sm"
            />
          </a>
        )}
        {editMode ? (
          <div
            className={styles.visibility}
            onClick={() => {
              if (!editMode) return;
              dispatch(
                togglePresetLayerVisible({
                  presetUuid: selectedPreset.uuid,
                  layerName: sublayer.name,
                })
              );
            }}
          >
            {presetLayerControls[sublayer.name].visible ? (
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
              selectedPreset.mapLayerControls[sublayer.name].visible || editMode
                ? null
                : styles.sublayerDisabled
            }`}
            onClick={() => {
              const tabSelected =
                presetUIStates[sublayer.name].tabSelected === "info" ? null : "info";
              dispatch(
                setPresetLayerUIState({
                  presetUuid: selectedPreset.uuid,
                  layerName: sublayer.name,
                  presetLayerUIState: {
                    ...presetUIStates[sublayer.name],
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
                  presetUIStates[sublayer.name].tabSelected === "sliders" ? null : "sliders";
                dispatch(
                  setPresetLayerUIState({
                    presetUuid: selectedPreset.uuid,
                    layerName: sublayer.name,
                    presetLayerUIState: {
                      ...presetUIStates[sublayer.name],
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

      {presetUIStates[sublayer.name].tabSelected === "info" && (
        <div
          className={`${styles.sublayerExpando} ${
            selectedPreset.mapLayerControls[sublayer.name].visible || editMode
              ? null
              : styles.sublayerDisabled
          }`}
        >
          <Info_subpanel sublayer={sublayer} />
        </div>
      )}
      {presetUIStates[sublayer.name].tabSelected === "sliders" && (
        <div className={styles.sublayerExpando}>
          <Settings_subpanel sublayer={sublayer} selectedPreset={selectedPreset} />
        </div>
      )}
    </div>
  );
};

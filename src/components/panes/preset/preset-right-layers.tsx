import { FunctionComponent } from "react";
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

import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  setPresetLayerUIState,
  togglePresetLayerUIStateExpanded,
  togglePresetSublayerVisible,
  upsertPresetByField,
  setPresetSublayerStyle,
} from "store/preset";
import Settings_subpanel from "../../interface/settings-and-slider";
import Info_subpanel from "./preset-right-layers-info";
import ReactDragListView from "react-drag-listview";
import sortBy from "lodash/sortBy";
import cloneDeep from "lodash/cloneDeep";

const Layers_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const missionLayers = useAppSelector((state) => state.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, deepEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    deepEqual
  );
  const presetsLayersUIStates = useAppSelector(
    (state) => state.preset.presetLayersUIStates[selectedPresetUuid],
    shallowEqual
  );

  const presetMapLayerControls = useAppSelector(
    (state) =>
      state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid)
        ?.mapSublayerControls,
    deepEqual
  );

  let orderedLayerUuids: PresetLayerOrder[]; //contains all actions in order
  if (selectedPreset.layerOrder) {
    orderedLayerUuids = selectedPreset?.layerOrder;
  } else {
    //if no ordering is defined, order by name
    const defaultOrder: PresetLayerOrder[] = [];
    for (const layer of sortBy(missionLayers, [(layer) => layer.name.toLowerCase()])) {
      const sublayers: Sublayer[] = sortBy(
        missionSublayers?.filter((s) => s.layerUuid === layer.uuid),
        [(sublayer) => sublayer.name.toLowerCase()]
      );
      defaultOrder.push({
        layerUuid: layer.uuid,
        sublayerUuids: sublayers.map((s) => s.uuid),
      });
    }
    orderedLayerUuids = defaultOrder;
  }

  //reorder header layers and then upsert to preset
  function reorderHeader(fromIndex: number, toIndex: number) {
    const newOrder = cloneDeep(orderedLayerUuids);
    const headerLayerBeingMoved = newOrder.splice(fromIndex, 1)[0]; //remove header layer
    newOrder.splice(toIndex, 0, headerLayerBeingMoved); //reinsert in new position
    dispatch(upsertPresetByField(selectedPreset.uuid, "layerOrder", newOrder));
  }

  //reorder sublayers and then upsert to preset
  function reorderSublayer(fromIndex: number, toIndex: number, headerUuid: string) {
    const newOrder = cloneDeep(orderedLayerUuids);
    const headerLayer = newOrder.find((headerLayers) => headerLayers.layerUuid === headerUuid);
    const headerLayerBeingMoved = headerLayer.sublayerUuids.splice(fromIndex, 1)[0]; //remove header layer
    headerLayer.sublayerUuids.splice(toIndex, 0, headerLayerBeingMoved); //reinsert in new position
    dispatch(upsertPresetByField(selectedPreset.uuid, "layerOrder", newOrder));
  }

  return (
    selectedPreset && (
      <div className={paneStyles.rightBody}>
        <div className={paneStyles.rightBodyTitle}>Preset Layer Configuration</div>
        <div className={paneStyles.rightBodyBody}>
          <div className={paneStyles.panelContainer}>
            <div className={styles.layersContainer}>
              <div className={styles.layersBody}>
                {missionLayers && presetsLayersUIStates && orderedLayerUuids && (
                  <ReactDragListView
                    onDragEnd={reorderHeader}
                    nodeSelector={`div.${styles.layerGroup}`}
                    handleSelector="a.headerReorder"
                  >
                    {orderedLayerUuids.map((presetLayerOrder: PresetLayerOrder) => {
                      //loop through layers in order
                      const headerLayer: Layer = missionLayers.find(
                        (layer) => layer.uuid === presetLayerOrder.layerUuid
                      );
                      const sublayers: Sublayer[] = missionSublayers.filter(
                        (sublayer) => sublayer.layerUuid === headerLayer.uuid
                      );

                      // Check if any of the sublayers are visible in this preset (for styling)
                      let sublayerVisible = false;
                      if (editMode) {
                        sublayerVisible = true; // show everything if in edit mode
                      } else {
                        //check if any of the sublayers are visible
                        sublayers?.forEach((sublayer) => {
                          if (presetMapLayerControls[sublayer.uuid]?.visible)
                            sublayerVisible = true;
                        });
                      }

                      return (
                        <div className={styles.layerGroup} key={headerLayer.uuid}>
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
                                  togglePresetLayerUIStateExpanded({
                                    presetUuid: selectedPreset.uuid,
                                    uuid: headerLayer.uuid,
                                  })
                                )
                              }
                            >
                              {presetsLayersUIStates[headerLayer.uuid]?.expanded ? (
                                <FontAwesomeIcon icon={faCaretDown} size="sm" />
                              ) : (
                                <FontAwesomeIcon icon={faCaretRight} size="sm" />
                              )}
                            </div>
                            <div className={sublayerVisible ? null : styles.layerDisabled}>
                              {headerLayer.name}
                            </div>
                          </div>
                          <ReactDragListView
                            onDragEnd={(fromIndex, toIndex) =>
                              reorderSublayer(fromIndex, toIndex, presetLayerOrder.layerUuid)
                            }
                            nodeSelector={`div.${styles.sublayerItemContainer}`}
                            handleSelector="a.sublayerReorder"
                          >
                            <div className={styles.sublayerGroup}>
                              {presetsLayersUIStates[headerLayer.uuid]?.expanded &&
                                sublayers &&
                                presetLayerOrder.sublayerUuids.map((sublayerUuid: string) => {
                                  const sublayer = sublayers.find((s) => s.uuid === sublayerUuid);
                                  return (
                                    <Sublayer
                                      key={`sub_${sublayer.uuid}`}
                                      sublayer={sublayer}
                                      selectedPreset={selectedPreset}
                                      layerUIStates={presetsLayersUIStates}
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
  layerUIStates: LayerUIStates;
  editMode: boolean;
}> = ({ sublayer, selectedPreset, layerUIStates, editMode }) => {
  const dispatch = useAppDispatch();
  const presetSublayerControls = selectedPreset?.mapSublayerControls;

  const styleSetterHandler = ({
    uuid,
    layerStyle,
  }: {
    uuid: string;
    layerStyle: MapSublayerStyle;
  }) => {
    dispatch(
      setPresetSublayerStyle({
        presetUuid: selectedPreset.uuid,
        layerUuid: uuid,
        style: layerStyle,
      })
    );
  };

  return (
    <div className={styles.sublayerItemContainer}>
      <div
        className={`${styles.sublayer} ${
          selectedPreset.mapSublayerControls[sublayer.uuid]?.visible || editMode
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
                togglePresetSublayerVisible({
                  presetUuid: selectedPreset.uuid,
                  layerUuid: sublayer.uuid,
                })
              );
            }}
          >
            {presetSublayerControls[sublayer.uuid]?.visible ? (
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
          {sublayer.name} {sublayer.type && `(${sublayer.type})`}
        </div>
        <div className={styles.sublayerToolIcons}>
          <div
            className={`${styles.sublayerToolIcon} ${
              selectedPreset.mapSublayerControls[sublayer.uuid]?.visible || editMode
                ? null
                : styles.sublayerDisabled
            }`}
            onClick={() => {
              const tabSelected =
                layerUIStates[sublayer.uuid].tabSelected === "info" ? null : "info";
              dispatch(
                setPresetLayerUIState({
                  presetUuid: selectedPreset.uuid,
                  layerUuid: sublayer.uuid,
                  layerUIState: {
                    ...layerUIStates[sublayer.uuid],
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
                  layerUIStates[sublayer.uuid].tabSelected === "sliders" ? null : "sliders";
                dispatch(
                  setPresetLayerUIState({
                    presetUuid: selectedPreset.uuid,
                    layerUuid: sublayer.uuid,
                    layerUIState: {
                      ...layerUIStates[sublayer.uuid],
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

      {layerUIStates[sublayer.uuid].tabSelected === "info" && (
        <div
          className={`${styles.sublayerExpando} ${
            selectedPreset.mapSublayerControls[sublayer.uuid]?.visible || editMode
              ? null
              : styles.sublayerDisabled
          }`}
        >
          <Info_subpanel sublayer={sublayer} />
        </div>
      )}
      {layerUIStates[sublayer.uuid].tabSelected === "sliders" && (
        <div className={styles.sublayerExpando}>
          <Settings_subpanel
            styleSetter={styleSetterHandler}
            type={sublayer.type}
            uuid={sublayer.uuid}
            mapSublayerControls={selectedPreset.mapSublayerControls}
          />
        </div>
      )}
    </div>
  );
};

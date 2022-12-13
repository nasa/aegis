import styles from "./map.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faTrashCan,
  faPlusCircle,
  faSave,
} from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../store";
import { setPresets } from "../../../store/mission";
import * as InternalAPI from "../../../http-client/internal-api";
import { useRouter } from "next/router";
import {
  setActiveSelectedName,
  setActiveSelectedType,
  setActiveSelectedUUID,
  setLayerControls,
  setSelectedRightNavItem,
} from "../../../store/map";
import { v4 } from "uuid";

const PresetList: FunctionComponent<{
  expandedSections: MapExpandedSections;
  setExpandedSections: SetMapExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const [presetName, setPresetName] = useState("");
  const [addPresetErrorMessage, setPresetErrorMessage] = useState("");
  const presets = useSelector((state: RootState) => state.mission.presets);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);
  const activePresetUUID = useSelector((state: RootState) => state.map.activeSelectedUUID);
  const user: AEGISUser = useSelector((state: RootState) => state.user.ironSessionData?.user);
  const mission = useSelector((state: RootState) => state.mission.mission);

  let selectedPreset;
  if (presets !== null) {
    selectedPreset = presets.filter((preset) => preset.uuid === activePresetUUID)[0];
  }
  const [layerHover, setLayerHover] = useState<string | null>(null);

  const handleAdd = async () => {
    let preset: Preset = null;
    if (presetName.length > 3) {
      preset = {
        uuid: v4(),
        name: presetName,
        description: "None yet",
        owner: user.id,
        mission: mission.id,
        layerControls: layerControls,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      preset = selectedPreset;
    }

    const newPreset = await InternalAPI.setPreset(preset);
    console.log(newPreset);
    if (newPreset.status === "success") {
      dispatch(setPresets([...presets, newPreset.data]));
      setPresetName("");
      setPresetErrorMessage("");
    } else {
      setPresetErrorMessage(newPreset.message);
    }
  };

  const handleClick = async (currentPreset: Preset) => {
    dispatch(setActiveSelectedUUID(currentPreset.uuid));
    dispatch(setActiveSelectedName(currentPreset.name));
    dispatch(setLayerControls(currentPreset.layerControls));
    dispatch(setActiveSelectedType("preset"));
    dispatch(setSelectedRightNavItem("preset_panel"));
  };

  const handleSave = async (currentPreset: Preset) => {
    await InternalAPI.setPreset(currentPreset);
  };

  const handleDelete = async (presetUUID: Preset["uuid"]) => {
    const deletePreset = await InternalAPI.deletePreset(presetUUID);
    if (deletePreset) {
      dispatch(setPresets(presets.filter((preset) => preset.uuid !== presetUUID)));
    }
  };
  useEffect(() => {
    (async () => {
      //If preset doesn't exist, try to get it.
      const { id } = router.query;
      console.log(!presets);
      if (!presets) {
        const presetData = await InternalAPI.getPresets(parseInt(id as string));
        console.log(presetData);
        if (presetData.data) {
          dispatch(setPresets(presetData.data));
        }
      }
    })();
  });
  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.layersContainer}>
        <div
          className={styles.layersHeader}
          onClick={() =>
            setExpandedSections({ ...expandedSections, userPresets: !expandedSections.userPresets })
          }
        >
          <div className={styles.expandoCaret}>
            {expandedSections.userPresets ? (
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            ) : (
              <FontAwesomeIcon icon={faCaretRight} size="sm" />
            )}
          </div>
          <div>My Presets</div>
        </div>
        <div className={styles.layersBody}>
          {expandedSections.userPresets ? (
            <div className={styles.layersList}>
              <div className={styles.layerGroup}>
                <div className={styles.layerSublayers}>
                  {presets ? (
                    Object.keys(presets).map((key) => {
                      const currentPreset = presets[key];
                      const selectedStyle =
                        currentPreset.uuid === activePresetUUID ? styles.selected : styles.normal;
                      return (
                        <div
                          key={`sub_${currentPreset.name}`}
                          className={selectedStyle}
                          onMouseOver={() => {
                            setLayerHover(currentPreset.name);
                          }}
                          onMouseOut={() => {
                            setLayerHover(null);
                          }}
                        >
                          <div
                            className={styles.sublayerTitle}
                            onClick={() => handleClick(currentPreset)}
                          >
                            {currentPreset.name}
                          </div>
                          {layerHover === currentPreset.name && (
                            <div className={styles.sublayerToolIcons}>
                              <div
                                className={styles.sublayerToolIcon}
                                onClick={() => {
                                  handleSave(currentPreset);
                                }}
                              >
                                <FontAwesomeIcon icon={faSave} />
                              </div>
                              <div
                                className={styles.sublayerToolIcon}
                                onClick={() => {
                                  handleDelete(currentPreset.uuid);
                                }}
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div>No Presets</div>
                  )}
                </div>
              </div>
              <div className={styles.layerItem}>
                <div className={styles.presetDetail}>
                  <span className={styles.presetText}>
                    Adjust imagery details visibility and settings and save current map view as a
                    preset.
                  </span>
                </div>
              </div>
              <div className={styles.layerItem}>
                <div className={styles.presetInsert}>
                  <input
                    className={styles.presetName}
                    type={"text"}
                    placeholder={"Type Preset Name"}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <span className={styles.presetAdd} onClick={handleAdd}>
                    <FontAwesomeIcon icon={faPlusCircle} /> Add Preset{" "}
                  </span>
                </div>
              </div>
              {addPresetErrorMessage && <span className={styles.message}>There was an error</span>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PresetList;

import styles from "./preset.module.css";
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
import { upsertPreset, upsertPresets } from "../../../store/preset";
import * as InternalAPI from "../../../http-client/internal-api";
import { useRouter } from "next/router";
import { setLayerControls } from "../../../store/map";
import {
  setSelectedPresetUuid,
  setSelectedRightNavItem,
  deletePreset,
} from "../../../store/preset";
import { v4 } from "uuid";

const PresetList: FunctionComponent<{
  expandedSections: MapExpandedSections;
  setExpandedSections: SetMapExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const [presetName, setPresetName] = useState("");
  const [addPresetErrorMessage, setPresetErrorMessage] = useState("");
  const presets = useSelector((state: RootState) => state.preset.presets);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);
  const selectedPresetUuid = useSelector((state: RootState) => state.preset.selectedPresetUuid);
  const user: AEGISUser = useSelector((state: RootState) => state.user.ironSessionData?.user);
  const mission = useSelector((state: RootState) => state.mission.mission);

  let selectedPreset;
  if (presets !== null) {
    selectedPreset = presets.filter((preset) => preset.uuid === selectedPresetUuid)[0];
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
      dispatch(upsertPreset(newPreset.data));
      setPresetName("");
      setPresetErrorMessage("");
    } else {
      setPresetErrorMessage(newPreset.message);
    }
  };

  const handleClick = async (currentPreset: Preset) => {
    if (currentPreset.uuid === selectedPresetUuid) {
      dispatch(setSelectedPresetUuid(null));
      return;
    }

    dispatch(setSelectedPresetUuid(currentPreset.uuid));
    dispatch(setLayerControls(currentPreset.layerControls));
    dispatch(setSelectedRightNavItem("info_panel"));
  };

  const handleSave = async (currentPreset: Preset) => {
    await InternalAPI.setPreset(currentPreset);
  };

  const handleDelete = async (presetUUID: Preset["uuid"]) => {
    const res = await InternalAPI.deletePreset(presetUUID);
    if (res) {
      dispatch(deletePreset(presetUUID));
    }
  };
  useEffect(() => {
    (async () => {
      //If preset doesn't exist, try to get it.
      const { id } = router.query;
      console.log(!presets);

      if (presets.length === 0 && id) {
        const presetData = await InternalAPI.getPresets(parseInt(id as string));

        if (presetData.data) {
          dispatch(upsertPresets(presetData.data));
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
            setExpandedSections({ ...expandedSections, presets: !expandedSections.presets })
          }
        >
          <div className={styles.expandoCaret}>
            {expandedSections.presets ? (
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            ) : (
              <FontAwesomeIcon icon={faCaretRight} size="sm" />
            )}
          </div>
          <div>My Presets</div>
        </div>
        <div className={styles.layersBody}>
          {expandedSections.presets ? (
            <>
              <div className={styles.layerGroup}>
                {presets ? (
                  Object.keys(presets).map((key) => {
                    const currentPreset = presets[key];
                    const selectedStyle =
                      currentPreset.uuid === selectedPresetUuid ? styles.presetItemSelected : null;
                    return (
                      <div
                        key={`sub_${currentPreset.name}`}
                        className={`${styles.presetItem} ${selectedStyle}`}
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
                              <FontAwesomeIcon icon={faSave} size="sm" />
                            </div>
                            <div
                              className={styles.sublayerToolIcon}
                              onClick={() => {
                                handleDelete(currentPreset.uuid);
                              }}
                            >
                              <FontAwesomeIcon icon={faTrashCan} size="sm" />
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
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PresetList;

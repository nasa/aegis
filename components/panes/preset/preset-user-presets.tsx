import styles from "./preset.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../store";
import {
  setPresetInteractions,
  upsertPreset,
  upsertPresets,
  upsertPresetsFromDB,
} from "../../../store/preset";
import * as InternalAPI from "../../../http-client/internal-api";
import { useRouter } from "next/router";
import { setLayerControls } from "../../../store/map";
import { setSelectedPresetUuid, setSelectedRightNavItem } from "../../../store/preset";
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
  const selectedRightNavItem = useSelector((state: RootState) => state.preset.selectedRightNavItem);
  const user: AEGISUser = useSelector((state: RootState) => state.user.ironSessionData?.user);
  const mission = useSelector((state: RootState) => state.mission.mission);

  let selectedPreset;
  if (presets !== null) {
    selectedPreset = presets.filter((preset) => preset.uuid === selectedPresetUuid)[0];
  }
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

      // set default layer control interactions for the new preset
      const layerControlInteractions: LayerControlInteractions = {};
      for (const [key] of Object.entries(layerControls)) {
        layerControlInteractions[key] = {
          expanded: true,
          tabSelected: null,
        };
      }
      dispatch(setPresetInteractions({ presetUuid: preset.uuid, layerControlInteractions }));
    } else {
      preset = selectedPreset;
    }

    const newPreset = await InternalAPI.setPreset(preset);
    if (newPreset.status === "success") {
      dispatch(upsertPreset(newPreset.data));
      setPresetName("");
      setPresetErrorMessage("");
    } else {
      setPresetErrorMessage(newPreset.message);
    }
  };

  const handleSelectPresetClick = async (currentPreset: Preset) => {
    if (currentPreset.uuid === selectedPresetUuid) {
      dispatch(setSelectedPresetUuid(null));
      return;
    }

    dispatch(setSelectedPresetUuid(currentPreset.uuid));
    dispatch(setLayerControls(currentPreset.layerControls));
    if (!selectedRightNavItem) dispatch(setSelectedRightNavItem("info_panel"));
  };

  useEffect(() => {
    (async () => {
      //If preset doesn't exist, try to get it.
      const { id } = router.query;

      if (presets.length === 0 && id) {
        const presetData = await InternalAPI.getPresets(parseInt(id as string));

        if (presetData.data) {
          dispatch(upsertPresets(presetData.data));
          dispatch(upsertPresetsFromDB(presetData.data));
          presetData.data.forEach((preset) => {
            const layerControlInteractions: LayerControlInteractions = {};
            for (const [key] of Object.entries(preset.layerControls)) {
              layerControlInteractions[key] = {
                expanded: true,
                tabSelected: null,
              };
            }
            dispatch(setPresetInteractions({ presetUuid: preset.uuid, layerControlInteractions }));
          });
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
                      >
                        <div
                          className={styles.sublayerTitle}
                          onClick={() => handleSelectPresetClick(currentPreset)}
                        >
                          {currentPreset.name}
                        </div>
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

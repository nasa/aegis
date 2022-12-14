import styles from "./preset.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../store";
import {
  duplicatePreset,
  setPresetEditMode,
  setPresetInteractions,
  upsertPreset,
  upsertPresets,
  upsertPresetsFromDb,
} from "../../../store/preset";
import * as InternalAPI from "../../../http-client/internal-api";
import { useRouter } from "next/router";
import { setLayerControls } from "../../../store/map";
import { setSelectedPresetUuid, setSelectedRightNavItem } from "../../../store/preset";
import { v4 as uuidv4 } from "uuid";
import { colors, uniqueNamesGenerator } from "unique-names-generator";
import { IconButton } from "components/interface/_global-elements";

const PresetEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const presets = useSelector((state: RootState) => state.preset.presets);
  const selectedPresetUuid = useSelector((state: RootState) => state.preset.selectedPresetUuid);
  const selectedRightNavItem = useSelector((state: RootState) => state.preset.selectedRightNavItem);
  const user: AEGISUser = useSelector((state: RootState) => state.user.ironSessionData?.user);
  const mission = useSelector((state: RootState) => state.mission.mission);
  const mapLayerControls = useSelector((state: RootState) => state.map.layerControls);

  let selectedPreset;
  if (presets !== null) {
    selectedPreset = presets.filter((preset) => preset.uuid === selectedPresetUuid)[0];
  }
  const handleCreatePreset = async () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [colors],
      style: "capital",
    });

    const blankPreset: Preset = {
      uuid: uuidv4(),
      name: randomName,
      description: "Enter description here",
      owner: user.id,
      mission: mission.id,
      missionPreset: false,
      layerControls: mapLayerControls,
    };

    dispatch(upsertPreset(blankPreset));
    // turn on edit mode for the new POI
    dispatch(setPresetEditMode({ presetUuid: blankPreset.uuid, editMode: true }));
    // select the newly created POI
    dispatch(setSelectedPresetUuid(blankPreset.uuid));
    // create preset interactions entry

    const layerControlInteractions: LayerControlInteractions = {};
    for (const [key] of Object.entries(blankPreset.layerControls)) {
      layerControlInteractions[key] = {
        expanded: true,
        tabSelected: null,
      };
    }
    dispatch(setPresetInteractions({ presetUuid: blankPreset.uuid, layerControlInteractions }));
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

  // On initial mount, get the presets from the DB
  useEffect(() => {
    (async () => {
      const { id } = router.query;

      if (presets.length === 0 && id) {
        const presetData = await InternalAPI.getPresets(parseInt(id as string));

        if (presetData.data) {
          dispatch(upsertPresets(presetData.data));
          dispatch(upsertPresetsFromDb(presetData.data));
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
    <>
      <div className={paneStyles.panelContainer}>
        <div className={styles.layersContainer}>
          <div className={styles.layersBody}>
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
          </div>
        </div>
      </div>
      <div className={paneStyles.iconButtons}>
        <IconButton
          onClick={() => {
            handleCreatePreset();
          }}
          label="Add"
          icon={faPlusCircle}
        ></IconButton>
        <IconButton
          onClick={() => {
            if (selectedPresetUuid !== null) {
              dispatch(duplicatePreset(selectedPreset));
            }
          }}
          label="Duplicate"
          icon={faClone}
          enabled={selectedPresetUuid !== null}
        ></IconButton>
      </div>
    </>
  );
};

export default PresetEditorLeft;

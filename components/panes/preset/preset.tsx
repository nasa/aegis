import styles from "./preset.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faGlobe, faPlusCircle, faUser } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import {
  duplicatePreset,
  setPresetEditMode,
  setPresetInteractions,
  upsertPreset,
} from "../../../store/preset";
import { setLayerControls } from "../../../store/map";
import { setSelectedPresetUuid, setSelectedPresetRightNavItem } from "../../../store/preset";
import { v4 as uuidv4 } from "uuid";
import { colors, uniqueNamesGenerator } from "unique-names-generator";
import { IconButton, ModifiedIndicator } from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
const profanityFilter = require("leo-profanity");

const PresetEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const presets = useAppSelector((state) => state.preset.presets, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const user: AEGISUser = useAppSelector((state) => state.user.ironSessionData?.user, shallowEqual);
  const missionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const mapLayerControls = useAppSelector((state) => state.map.layerControls, shallowEqual);

  let selectedPreset: Preset;
  if (presets !== null) {
    selectedPreset = presets.find((preset: Preset) => preset.uuid === selectedPresetUuid);
  }
  const handleCreatePreset = async () => {
    let randomName = "";
    while (randomName === "") {
      const name = uniqueNamesGenerator({
        dictionaries: [colors],
        style: "capital",
      });
      const presetWithSameName = presets.find((preset) => preset.name === name);
      const profanityCheck = profanityFilter.check(name);
      randomName = presetWithSameName || profanityCheck ? "" : name;
    }

    const blankPreset: Preset = {
      uuid: uuidv4(),
      name: randomName,
      description: "Enter description here",
      ownerId: user.id,
      missionId: missionId,
      missionPreset: false,
      missionPresetDefault: false,
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

  const missionPresets = presets
    .filter((preset) => preset.missionPreset === true)
    .sort((a, b) => (a.name > b.name ? 1 : -1));

  const userPresets = presets
    .filter((preset) => preset.missionPreset === false)
    .sort((a, b) => (a.name > b.name ? 1 : -1));

  return (
    <>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          {missionPresets ? (
            <PresetList presets={missionPresets} selectedPresetUuid={selectedPresetUuid} />
          ) : (
            <div>No Mission Presets</div>
          )}
        </div>
        <div className={paneStyles.panelSection}>
          {userPresets ? (
            <PresetList presets={userPresets} selectedPresetUuid={selectedPresetUuid} />
          ) : (
            <div>No User Presets</div>
          )}
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

const PresetList: FunctionComponent<{
  presets: Preset[];
  selectedPresetUuid: string;
}> = ({ presets, selectedPresetUuid }) => {
  const dispatch = useDispatch();
  const presetsFromDb = useAppSelector((state) => state.preset.presetsFromDb, shallowEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );

  const handleSelectPresetClick = async (currentPreset: Preset) => {
    if (currentPreset.uuid === selectedPresetUuid) {
      dispatch(setSelectedPresetUuid(null));
      return;
    }

    dispatch(setSelectedPresetUuid(currentPreset.uuid));
    dispatch(setLayerControls(currentPreset.layerControls));
    if (!selectedRightNavItem) dispatch(setSelectedPresetRightNavItem("info_panel"));
  };

  return (
    <div className={styles.layerGroup}>
      {Object.keys(presets).map((key) => {
        const currentPreset = presets[key];
        const selectedStyle =
          currentPreset.uuid === selectedPresetUuid ? styles.presetItemSelected : null;
        const iconSelectedStyle =
          currentPreset.uuid === selectedPresetUuid ? styles.presetIconSelected : null;

        const presetFromDb = presetsFromDb.filter(
          (preset) => preset.uuid === currentPreset.uuid
        )[0];
        return (
          <div
            key={`sub_${currentPreset.name}`}
            className={`${styles.presetItem} ${selectedStyle}`}
          >
            <div
              className={styles.presetTitle}
              onClick={() => handleSelectPresetClick(currentPreset)}
            >
              {currentPreset.name}
              <span className={styles.defaultText}>
                {currentPreset.missionPresetDefault ? "(Default)" : ""}
              </span>
              <ModifiedIndicator
                obj1={currentPreset}
                obj2={presetFromDb}
                svgStyle={{
                  width: "15",
                  height: "12",
                  cx: "5",
                  cy: "9",
                  r: "3",
                  fill: "#ff0000",
                }}
              />
            </div>
            <div className={`${styles.presetIcon} ${iconSelectedStyle}`}>
              {currentPreset.missionPreset ? (
                <FontAwesomeIcon icon={faGlobe} />
              ) : (
                <FontAwesomeIcon icon={faUser} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PresetEditorLeft;

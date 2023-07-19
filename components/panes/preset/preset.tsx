import styles from "./preset.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faGlobe, faPlusCircle, faUser } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useState } from "react";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setMapLayerControls } from "store/map";
import { setSelectedPresetUuid, setSelectedPresetRightNavItem } from "store/preset";
import { ModifiedIndicator } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setRightPanelOpen } from "store/interface";
import { setAllLayerControlsInvisible } from "utils/store";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreatePreset, thunkDuplicatePreset } from "store/thunk/thunkPreset";

const PresetEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const presets = useAppSelector((state) => state.preset.presets, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  let selectedPreset: Preset;
  if (presets !== null) {
    selectedPreset = presets.find((preset: Preset) => preset.uuid === selectedPresetUuid);
  }

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
      {editPerms && (
        <div className={paneStyles.iconButtons}>
          <Button
            onClick={() => {
              dispatch(thunkCreatePreset());
            }}
            label="Add"
            icon={faPlusCircle}
            style={{ width: "65px" }}
          />
          <Button
            onClick={() => {
              if (selectedPresetUuid !== null) {
                dispatch(thunkDuplicatePreset({ preset: selectedPreset }));
              }
            }}
            label="Duplicate"
            icon={faClone}
            enabled={selectedPresetUuid !== null}
            style={{ width: "95px" }}
          />
        </div>
      )}
    </>
  );
};

const PresetList: FunctionComponent<{
  presets: Preset[];
  selectedPresetUuid: string;
}> = ({ presets, selectedPresetUuid }) => {
  const dispatch = useAppDispatch();
  const presetsFromDb = useAppSelector((state) => state.preset.presetsFromDb, shallowEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );

  const [presetHoverUuid, setPresetHoverUuid] = useState(null);

  const handleSelectPresetClick = async (currentPreset: Preset) => {
    if (currentPreset.uuid === selectedPresetUuid) {
      dispatch(setSelectedPresetUuid(null));
      dispatch(setRightPanelOpen(false));
      dispatch(setMapLayerControls(setAllLayerControlsInvisible(currentPreset.mapLayerControls)));
      return;
    }

    dispatch(setSelectedPresetUuid(currentPreset.uuid));
    dispatch(setMapLayerControls(currentPreset.mapLayerControls));
    if (!selectedRightNavItem) dispatch(setSelectedPresetRightNavItem("info_panel"));
    dispatch(setRightPanelOpen(true));
  };

  return (
    <div className={styles.layerGroup}>
      {presets.map((currentPreset, index) => {
        let isSelectedOrHoveredStyle = null;
        if (currentPreset.uuid === selectedPresetUuid) {
          isSelectedOrHoveredStyle = styles.presetItemSelected;
        } else if (currentPreset.uuid === presetHoverUuid) {
          isSelectedOrHoveredStyle = styles.presetItemHovered;
        }
        const iconSelectedStyle =
          currentPreset.uuid === selectedPresetUuid ? styles.presetIconSelected : null;

        const presetFromDb = presetsFromDb.find((preset) => preset.uuid === currentPreset.uuid);
        return (
          <div
            key={`sub_${currentPreset.name}_${index}`}
            className={`${styles.presetItem} ${isSelectedOrHoveredStyle}`}
            onMouseEnter={() => {
              setPresetHoverUuid(currentPreset.uuid);
            }}
            onMouseLeave={() => {
              setPresetHoverUuid(null);
            }}
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
                obj1={[currentPreset]}
                obj2={[presetFromDb]}
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

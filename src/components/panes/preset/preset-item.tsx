import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import styles from "./preset.module.css";
import { setSelectedPresetUuid, setSelectedPresetRightNavItem } from "store/preset";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";

const PresetItem: FunctionComponent<{
  selectedPresetUuid: string;
  preset: Preset;
  presetFromDb: Preset;
  hoverUuid: string | null;
  onHover: (uuid: string | null) => void;
}> = ({ selectedPresetUuid, preset, presetFromDb, hoverUuid, onHover }) => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );

  let isSelectedOrHoveredStyle = null;
  let isSelectedLabel = "";
  if (preset.uuid === selectedPresetUuid) {
    isSelectedOrHoveredStyle = styles.presetItemSelected;
    isSelectedLabel = "selectedPreset";
  } else if (preset.uuid === hoverUuid) {
    isSelectedOrHoveredStyle = styles.presetItemHovered;
  }

  const handleClick = () => {
    if (preset.uuid === selectedPresetUuid) return;

    dispatch(setSelectedPresetUuid(preset.uuid));
    if (!selectedRightNavItem) dispatch(setSelectedPresetRightNavItem("info_panel"));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  };

  return (
    <div className={`${styles.presetItem} ${isSelectedOrHoveredStyle}`} aria-label="mapPreset">
      <div className={styles.itemIcon}>
        <FontAwesomeIcon icon={faGlobe} size="sm" />{" "}
      </div>
      <div
        className={`${styles.presetTitle} ${
          preset.uuid === selectedPresetUuid ? styles.presetItemSelected : ""
        }`}
        aria-label={isSelectedLabel}
        onClick={handleClick}
        onMouseEnter={() => onHover(preset.uuid)}
        onMouseLeave={() => onHover(null)}
      >
        <span aria-label="leftPresetName">{preset.name}</span>
        <span className={styles.defaultText} aria-label="leftPresetIsDefault">
          {preset.missionDefault ? "(Default)" : ""}
        </span>
        <ModifiedIndicator obj1={[preset]} obj2={[presetFromDb]} />
      </div>
    </div>
  );
};

export default PresetItem;

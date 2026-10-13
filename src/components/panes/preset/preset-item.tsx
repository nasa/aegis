import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import styles from "./preset.module.css";
import { setSelectedPresetUuid, setSelectedPresetRightNavItem } from "store/preset";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { setLeftPanelHoverUuid } from "store/hover";

const PresetItem: FunctionComponent<{
  presetUuid: string;
}> = ({ presetUuid }) => {
  const dispatch = useAppDispatch();
  const preset = useMissionDocSelector((mission) => mission.presets?.[presetUuid], deepEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  // Scroll into view when this preset becomes selected (e.g. after add/duplicate)
  const itemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (presetUuid === selectedPresetUuid) {
      itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [presetUuid, selectedPresetUuid]);

  if (!preset) return null;

  let isSelectedOrHoveredStyle = null;
  let isSelectedLabel = "";
  if (preset.uuid === selectedPresetUuid) {
    isSelectedOrHoveredStyle = styles.presetItemSelected;
    isSelectedLabel = "selectedPreset";
  } else if (preset.uuid === hoverItemUuid) {
    isSelectedOrHoveredStyle = styles.presetItemHovered;
  }

  const handleClick = () => {
    if (preset.uuid === selectedPresetUuid) return;

    dispatch(setSelectedPresetUuid(preset.uuid));
    if (!selectedRightNavItem) dispatch(setSelectedPresetRightNavItem("info_panel"));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  };

  return (
    <div
      ref={itemRef}
      className={`${styles.presetItem} ${isSelectedOrHoveredStyle}`}
      aria-label="mapPreset"
    >
      <div className={styles.itemIcon}>
        <FontAwesomeIcon icon={faGlobe} size="sm" />{" "}
      </div>
      <div
        className={`${styles.presetTitle} ${
          preset.uuid === selectedPresetUuid ? styles.presetItemSelected : ""
        }`}
        aria-label={isSelectedLabel}
        onClick={handleClick}
        onMouseEnter={() => {
          dispatch(setLeftPanelHoverUuid(presetUuid));
        }}
        onMouseLeave={() => {
          dispatch(setLeftPanelHoverUuid(null));
        }}
      >
        <span aria-label="leftPresetName">{preset.name}</span>
        <span className={styles.defaultText} aria-label="leftPresetIsDefault">
          {preset.missionDefault ? "(Default)" : ""}
        </span>
      </div>
    </div>
  );
};

export default PresetItem;

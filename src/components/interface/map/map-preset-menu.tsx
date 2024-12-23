import React, { Dispatch, SetStateAction } from "react";
import styles from "./map-preset-menu.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { Dropdown } from "components/interface/form/globalFields";

const PresetWrapper: React.FC<{
  selectedPreset: Preset;
  setSelectedPreset: Dispatch<SetStateAction<Preset>>;
  presetsFromDb: Preset[];
}> = ({ selectedPreset, setSelectedPreset, presetsFromDb }) => {
  return (
    <div
      className={styles.presetMenu}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html="Select Map Preset"
    >
      <div className={styles.presetIcon}>
        <FontAwesomeIcon icon={faGlobe} size="sm" />
      </div>
      <Dropdown
        selected={selectedPreset?.uuid}
        onChange={(val) => {
          setSelectedPreset(
            presetsFromDb.find((preset) => {
              return preset.uuid === val;
            })
          );
        }}
        containerStyle={{ padding: "2px 0px 2px 0px" }}
      >
        {[...presetsFromDb]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((preset) => {
            return (
              <option key={preset.uuid} value={preset.uuid}>
                {preset.name}
              </option>
            );
          })}
      </Dropdown>
    </div>
  );
};

export default PresetWrapper;

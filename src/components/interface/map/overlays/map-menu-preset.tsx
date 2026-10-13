import type { Dispatch, SetStateAction } from "react";
import React from "react";
import styles from "./map-menu-preset.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { Dropdown } from "components/interface/form/globalFields";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { selectFoldersByType } from "store/selectors";
import { createFolderOrganizedDropdownOptions } from "utils/dropdown-options";

const MapPresetMenu: React.FC<{
  selectedPreset: Preset;
  setSelectedPreset: Dispatch<SetStateAction<Preset>>;
  presets: Preset[];
}> = ({ selectedPreset, setSelectedPreset, presets }) => {
  const folders =
    useMissionDocSelector((mission) => selectFoldersByType(mission, "preset"), deepEqual) ?? [];

  // Create a mapping from preset UUIDs to their folder UUIDs
  const itemsToFolders = folders.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  // Generate organized dropdown options
  const presetOptions = createFolderOrganizedDropdownOptions({
    items: presets,
    folders,
    itemsToFolders,
  });

  return (
    <div
      className={styles.presetMenu}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-content="Select Map Preset"
    >
      <div className={styles.presetIcon}>
        <FontAwesomeIcon icon={faGlobe} size="sm" />
      </div>
      <Dropdown
        selected={selectedPreset?.uuid}
        onChange={(val) => {
          setSelectedPreset(
            presets.find((preset) => {
              return preset.uuid === val;
            })
          );
        }}
        containerStyle={{ padding: "2px 0px 2px 0px" }}
      >
        {presetOptions}
      </Dropdown>
    </div>
  );
};

export default MapPresetMenu;

import type { Dispatch, SetStateAction } from "react";
import React from "react";
import styles from "./map-menu-preset.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { Dropdown } from "components/interface/form/globalFields";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import { createFolderOrganizedDropdownOptions } from "utils/folder-dropdown";

const MapPresetMenu: React.FC<{
  selectedPreset: Preset;
  setSelectedPreset: Dispatch<SetStateAction<Preset>>;
  presetsFromDb: Preset[];
}> = ({ selectedPreset, setSelectedPreset, presetsFromDb }) => {
  // Get folder data from the Redux store
  const folders = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "preset"),
    deepEqual
  );

  // Create a mapping from preset UUIDs to their folder UUIDs
  const itemsToFolders = folders.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  // Generate organized dropdown options
  const presetOptions = createFolderOrganizedDropdownOptions({
    items: presetsFromDb,
    folders,
    itemsToFolders,
  });

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
        {presetOptions}
      </Dropdown>
    </div>
  );
};

export default MapPresetMenu;

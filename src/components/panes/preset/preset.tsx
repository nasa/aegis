import presetStyles from "./preset.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import type { FunctionComponent } from "react";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreatePreset, thunkDuplicatePreset } from "store/thunk/thunkPreset";
import PresetItem from "./preset-item";
import { FolderOrganizer } from "components/interface/folders";
import { useMissionDocSelector } from "utils/useDocSelector";
import { selectFoldersByType } from "store/selectors";
import { thunkCreateFolder } from "store/thunk/thunkFolder";
import { withMissionChange } from "client/automergeDocHandles";
import { applyMoveItemToFolder } from "operations/apply/apply-mission-folder";
import sortBy from "lodash/sortBy";

const PresetEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const presetUuids =
    useMissionDocSelector(
      (mission) =>
        sortBy(Object.values(mission.presets ?? {}), [(preset) => preset.name.toLowerCase()]).map(
          (preset) => preset.uuid
        ),
      deepEqual
    ) ?? [];
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const showButtons = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );

  const folderRecords =
    useMissionDocSelector((mission) => selectFoldersByType(mission, "preset"), deepEqual) ?? [];

  const itemsToFolders = folderRecords.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  const setItemFolder = ({ folderUuid, uuid }: { folderUuid: string | null; uuid: string }) => {
    withMissionChange((m) => applyMoveItemToFolder(m, { folderUuid, itemUuid: uuid }));
  };

  const renderPresetItem = ({ itemUuid }: FolderItemProps) => {
    return <PresetItem presetUuid={itemUuid} />;
  };

  return (
    <>
      <div
        className={paneStyles.activeComponentTitle}
        style={{ color: "var(--preset)" }}
        aria-label="leftPanelTitle"
      >
        Map Display Presets
      </div>
      <div className={paneStyles.leftPanelContainer}>
        <div className={paneStyles.leftPanelContainerTop} aria-label="presetList">
          <div className={presetStyles.container}>
            <FolderOrganizer
              itemUuids={presetUuids}
              renderItem={renderPresetItem}
              folders={folderRecords}
              itemsToFolders={itemsToFolders}
              setItemFolder={setItemFolder}
              hideMenu={!editPerms}
            />
          </div>
        </div>
        <div className={paneStyles.leftPanelContainerBottom}>
          {editPerms && (
            <div className={paneStyles.iconButtons}>
              {showButtons && (
                <>
                  <Button
                    onClick={() => dispatch(thunkCreatePreset())}
                    label="Add"
                    icon={faPlusCircle}
                    style={{ width: "65px" }}
                  />
                  <Button
                    onClick={() =>
                      selectedPresetUuid &&
                      dispatch(thunkDuplicatePreset({ presetUuid: selectedPresetUuid }))
                    }
                    label="Duplicate"
                    icon={faClone}
                    enabled={selectedPresetUuid !== null}
                    style={{ width: "95px" }}
                  />
                </>
              )}
              <Button
                onClick={() => dispatch(thunkCreateFolder({ type: "preset" }))}
                label="Folder"
                icon={faFolderPlus}
                style={{ width: "80px" }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PresetEditorLeft;

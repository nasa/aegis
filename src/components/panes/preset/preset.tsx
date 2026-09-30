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
import { thunkAddRemoveFolderItem, thunkCreateFolder } from "store/thunk/thunkFolder";
import sortBy from "lodash/sortBy";

const PresetEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const presetUuids = useAppSelector(
    (state) =>
      sortBy(state.preset.presets, [(preset) => preset.name.toLowerCase()]).map(
        (preset) => preset.uuid
      ),
    deepEqual
  );
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const folderRecords = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "preset"),
    deepEqual
  );
  const foldersInterface = useAppSelector((state) => {
    const allFoldersInterface = state.interface.foldersInterface;
    return allFoldersInterface.filter((folderInterface) =>
      folderRecords.some((folder) => folder.uuid === folderInterface.uuid)
    );
  }, deepEqual);

  const itemsToFolders = folderRecords.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  const setItemFolder = ({ folderUuid, uuid }: { folderUuid: string | null; uuid: string }) => {
    dispatch(thunkAddRemoveFolderItem({ folderUuid, itemUuid: uuid }));
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
              foldersInterface={foldersInterface}
              itemsToFolders={itemsToFolders}
              setItemFolder={setItemFolder}
              hideMenu={!editPerms}
            />
          </div>
        </div>
        <div className={paneStyles.leftPanelContainerBottom}>
          {editPerms && (
            <div className={paneStyles.iconButtons}>
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

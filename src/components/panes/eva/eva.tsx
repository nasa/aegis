import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import EvaItem from "./eva-item";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { faClone, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateEva, thunkDuplicateEva } from "store/thunk/thunkEva";
import { FolderOrganizer } from "components/interface/folders";
import { thunkAddRemoveFolderItem, thunkCreateFolder } from "store/thunk/thunkFolder";
import sortBy from "lodash/sortBy";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const evas = useAppSelector((state) => state.eva.evas, deepEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const folderRecords = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "eva"),
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
    dispatch(
      thunkAddRemoveFolderItem({
        folderUuid,
        itemUuid: uuid,
      })
    );
  };

  const renderEvaItem = ({ item: eva, first }: FolderItemProps<Eva>) => {
    return (
      <div key={eva.uuid} aria-label="evaList-item">
        <EvaItem eva={eva} first={first} />
      </div>
    );
  };

  return (
    <div className={paneStyles.leftPanelContainer}>
      <div className={paneStyles.leftPanelContainerTop} aria-label="evaList">
        <FolderOrganizer
          items={sortBy(evas, [(eva) => eva.name.toLowerCase()])}
          getItemId={(eva) => eva.uuid}
          renderItem={renderEvaItem}
          folders={folderRecords}
          foldersInterface={foldersInterface}
          itemsToFolders={itemsToFolders}
          setItemFolder={setItemFolder}
          hideMenu={!editPerms}
        />
      </div>
      <div className={paneStyles.leftPanelContainerBottom}>
        {editPerms && (
          <div className={paneStyles.iconButtons}>
            <Button
              ariaLabel="addEva"
              onClick={() => {
                dispatch(thunkCreateEva());
              }}
              label="Add"
              icon={faPlusCircle}
              style={{ width: "65px" }}
              toolTip="Add a new EVA"
            />
            <Button
              ariaLabel="duplicateEva"
              onClick={() => {
                if (selectedEva) {
                  dispatch(thunkDuplicateEva({ eva: selectedEva, includeStations: false }));
                }
              }}
              label="Duplicate"
              icon={faClone}
              enabled={!!selectedEva}
              style={{ width: "95px" }}
              toolTip="Duplicate this EVA and its Traverses"
            />
            <Button
              ariaLabel="duplicateEvaWithStations"
              onClick={() => {
                if (selectedEva) {
                  if (
                    confirm(
                      "This will duplicate the EVA and also make duplicates of all stations in this EVA and will name them 'station name (copy X)'. Are you sure?"
                    )
                  ) {
                    dispatch(thunkDuplicateEva({ eva: selectedEva, includeStations: true }));
                  }
                }
              }}
              label="Dup w/ Stns"
              icon={faClone}
              enabled={!!selectedEva}
              style={{ width: "110px" }}
              toolTip="Duplicate this EVA and its Traverses and Stations"
            />
            <Button
              ariaLabel="addFolder"
              onClick={() => {
                dispatch(thunkCreateFolder({ type: "eva" }));
              }}
              label="Folder"
              icon={faFolderPlus}
              style={{ width: "80px" }}
              toolTip="Create a new folder"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default EvaPlannerLeft;

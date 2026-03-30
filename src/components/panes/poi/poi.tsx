import poiStyles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import type { FunctionComponent } from "react";
import { Button } from "components/interface/form/globalFields";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import PoiItem from "./poi-item";
import { thunkCreatePoi, thunkDuplicatePoi } from "store/thunk/thunkPoi";
import { useAppDispatch } from "utils/useAppDispatch";
import sortBy from "lodash/sortBy";
import { FolderOrganizer } from "components/interface/folders";
import { thunkAddRemoveFolderItem, thunkCreateFolder } from "store/thunk/thunkFolder";

const PoiEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const poiUuids = useAppSelector(
    (state) => sortBy(state.poi.pois, [(poi) => poi.name.toLowerCase()]).map((poi) => poi.uuid),
    deepEqual
  );

  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const folderRecords = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "poi"),
    deepEqual
  );
  const foldersInterface = useAppSelector((state) => {
    const allFoldersInterface = state.interface.foldersInterface;
    // Filter the folders interface state to only include folders in folderRecords
    return allFoldersInterface.filter((folderInterface) =>
      folderRecords.some((folder) => folder.uuid === folderInterface.uuid)
    );
  }, deepEqual);

  // Create a mapping from poi UUIDs to their folder UUIDs based on folder.items arrays
  const itemsToFolders = folderRecords.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  // Handle folder assignment changes
  const setItemFolder = ({ folderUuid, uuid }: { folderUuid: string | null; uuid: string }) => {
    dispatch(
      thunkAddRemoveFolderItem({
        folderUuid,
        itemUuid: uuid,
      })
    );
  };

  // Render a POI item
  const renderPoiItem = ({ itemUuid }: FolderItemProps) => {
    return <PoiItem poiUuid={itemUuid} />;
  };

  return (
    <>
      <div
        className={paneStyles.activeComponentTitle}
        style={{ color: "var(--poi)" }}
        aria-label="leftPanelTitle"
      >
        Points of Interest
      </div>
      <div className={paneStyles.leftPanelContainer}>
        <div className={paneStyles.leftPanelContainerTop}>
          <div className={poiStyles.container} aria-label="poiList">
            <FolderOrganizer
              itemUuids={poiUuids}
              renderItem={renderPoiItem}
              folders={folderRecords}
              foldersInterface={foldersInterface}
              itemsToFolders={itemsToFolders}
              setItemFolder={setItemFolder}
            />
          </div>
        </div>
        <div className={paneStyles.leftPanelContainerBottom}>
          {editPerms && (
            <div className={paneStyles.iconButtons}>
              <Button
                ariaLabel="addPoi"
                onClick={() => {
                  dispatch(thunkCreatePoi());
                }}
                label="Add"
                icon={faPlusCircle}
                style={{ width: "65px" }}
              />
              <Button
                ariaLabel="duplicatePoi"
                onClick={() => {
                  dispatch(thunkDuplicatePoi({ poiUuid: selectedPoiUuid }));
                }}
                label="Duplicate"
                icon={faClone}
                enabled={selectedPoiUuid !== null}
                style={{ width: "95px" }}
              />
              <Button
                ariaLabel="addFolder"
                onClick={() => {
                  dispatch(thunkCreateFolder({ type: "poi" }));
                }}
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

export default PoiEditorLeft;

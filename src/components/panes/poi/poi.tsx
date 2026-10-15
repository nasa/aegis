import poiStyles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import type { FunctionComponent } from "react";
import { Button } from "components/interface/form/globalFields";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import PoiItem from "./poi-item";
import { thunkDocCreatePoi, thunkDocDuplicatePoi } from "store/thunk/thunkPoi";
import { useAppDispatch } from "utils/useAppDispatch";
import sortBy from "lodash/sortBy";
import { FolderOrganizer } from "components/interface/folders";
import { selectFoldersByType } from "store/selectors";
import { thunkCreateFolder } from "store/thunk/thunkFolder";
import { withMissionChange } from "client/automergeDocHandles";
import { applyMoveItemToFolder } from "operations/apply/apply-mission-folder";
import { useMissionDocSelector } from "utils/useDocSelector";

const PoiEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const poiUuids =
    useMissionDocSelector(
      (mission) =>
        sortBy(Object.values(mission.pois), [(poi) => poi.name.toLowerCase()]).map(
          (poi) => poi.uuid
        ),
      deepEqual
    ) ?? [];

  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);

  const showButtons = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );

  const folderRecords =
    useMissionDocSelector((mission) => selectFoldersByType(mission, "poi"), deepEqual) ?? [];

  // Create a mapping from poi UUIDs to their folder UUIDs based on folder.items arrays
  const itemsToFolders = folderRecords.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  // Handle folder assignment changes
  const setItemFolder = ({ folderUuid, uuid }: { folderUuid: string | null; uuid: string }) => {
    withMissionChange((m) => applyMoveItemToFolder(m, { folderUuid, itemUuid: uuid }));
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
              itemsToFolders={itemsToFolders}
              setItemFolder={setItemFolder}
            />
          </div>
        </div>
        <div className={paneStyles.leftPanelContainerBottom}>
          <div className={paneStyles.iconButtons}>
            {showButtons && (
              <>
                <Button
                  ariaLabel="addPoi"
                  onClick={() => {
                    dispatch(thunkDocCreatePoi());
                  }}
                  label="Add"
                  icon={faPlusCircle}
                  style={{ width: "65px" }}
                />
                <Button
                  ariaLabel="duplicatePoi"
                  onClick={() => {
                    dispatch(thunkDocDuplicatePoi({ poiUuid: selectedPoiUuid }));
                  }}
                  label="Duplicate"
                  icon={faClone}
                  enabled={selectedPoiUuid !== null}
                  style={{ width: "95px" }}
                />
              </>
            )}
            {showButtons && (
              <Button
                ariaLabel="addFolder"
                onClick={() => {
                  dispatch(thunkCreateFolder({ type: "poi" }));
                }}
                label="Folder"
                icon={faFolderPlus}
                style={{ width: "80px" }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default PoiEditorLeft;

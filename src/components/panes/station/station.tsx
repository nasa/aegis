import stationStyles from "./station.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { Button } from "components/interface/form/globalFields";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import StationItem from "./station-item";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateStation, thunkDuplicateStation } from "store/thunk/thunkStation";
import sortBy from "lodash/sortBy";
import { FolderOrganizer } from "components/interface/folders";
import { thunkAddRemoveFolderItem, thunkCreateFolder } from "store/thunk/thunkFolder";
import { selectAsPlannedStations } from "store/selectors";

const StationEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const stations = useAppSelector(selectAsPlannedStations, deepEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, deepEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const actions = useAppSelector((state) => state.action.actions, deepEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, deepEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const folderRecords = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "station"),
    deepEqual
  );
  const foldersInterface = useAppSelector((state) => {
    const allFoldersInterface = state.interface.foldersInterface;
    return allFoldersInterface.filter((folderInterface) =>
      folderRecords.some((folder) => folder.uuid === folderInterface.uuid)
    );
  }, deepEqual);

  // Create a mapping from station UUIDs to their folder UUIDs
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

  // Render a Station item
  const renderStationItem = ({ item: station }: FolderItemProps<Station>) => {
    const stationFromDb = stationsFromDb.find(
      (stationFromDb) => stationFromDb.uuid === station.uuid
    );
    const stationActions = actions.filter((action) => action.stationUuid === station.uuid);
    const stationActionsFromDb = actionsFromDb.filter(
      (action) => action.stationUuid === station.uuid
    );

    return (
      <StationItem
        selectedStationUuid={selectedStationUuid}
        station={station}
        stationFromDb={stationFromDb}
        stationActions={stationActions}
        stationActionsFromDb={stationActionsFromDb}
      />
    );
  };

  return (
    <>
      <div
        className={paneStyles.activeComponentTitle}
        style={{ color: "var(--station)" }}
        aria-label="leftPanelTitle"
      >
        Stations
      </div>
      <div className={paneStyles.leftPanelContainer}>
        <div className={paneStyles.leftPanelContainerTop} aria-label="stationList">
          <div className={stationStyles.container}>
            <div className={stationStyles.body} aria-label="stationList">
              <FolderOrganizer
                items={sortBy(stations, [(station) => station.name.toLowerCase()])}
                getItemId={(station) => station.uuid}
                renderItem={renderStationItem}
                folders={folderRecords}
                foldersInterface={foldersInterface}
                itemsToFolders={itemsToFolders}
                setItemFolder={setItemFolder}
              />
            </div>
          </div>
        </div>
        <div className={paneStyles.leftPanelContainerBottom}>
          {editPerms && (
            <div className={paneStyles.iconButtons}>
              <Button
                ariaLabel="addStation"
                onClick={() => {
                  dispatch(thunkCreateStation());
                }}
                label="Add"
                icon={faPlusCircle}
                style={{ width: "65px" }}
              />
              <Button
                ariaLabel="duplicateStation"
                onClick={() => {
                  dispatch(
                    thunkDuplicateStation({
                      stationUuid: selectedStationUuid,
                      preserveRefUuid: false,
                    })
                  );
                }}
                label="Duplicate"
                icon={faClone}
                enabled={selectedStationUuid !== null}
                style={{ width: "95px" }}
              />
              <Button
                ariaLabel="addFolder"
                onClick={() => {
                  dispatch(thunkCreateFolder({ type: "station" }));
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

export default StationEditorLeft;

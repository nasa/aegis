import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import EvaItem from "./eva-item";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { faClone, faEye, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkCreateEva,
  thunkDuplicateEva,
  thunkSetOnlyShowRunningRexEva,
} from "store/thunk/thunkEva";
import { FolderOrganizer } from "components/interface/folders";
import { thunkAddRemoveFolderItem, thunkCreateFolder } from "store/thunk/thunkFolder";
import sortBy from "lodash/sortBy";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const showRunningRexOnly = useAppSelector((state) => state.eva.showRunningRexOnly, refEqual);
  // Handles if we have a running rex.
  // The tricky part is only the as-planned evas are passed as props in to the components.
  // So find the running rex eva's as-planned uuid if we have a rex that is running.
  const theRunningRexEvaAsPlannedUuid = useAppSelector((state) => {
    const runningRex = state.rex.rexesFromDb.find((r) => r.isRunning);
    if (!runningRex) return null;
    const runningRexEvaRefUuid = state.eva.evas.find((e) => e.uuid === runningRex.evaUuid)?.refUuid;
    const allRexEvas = state.rex.rexes.map((rex) => rex.evaUuid);
    const asPlannedEva = state.eva.evas.find(
      (eva) => eva.refUuid === runningRexEvaRefUuid && !allRexEvas.includes(eva.uuid)
    );
    return asPlannedEva ? asPlannedEva.uuid : null;
  }, refEqual);
  // these are the as-planned evas that are passed into the sub component to create the list of evas
  const asPlannedEvas = useAppSelector((state) => {
    if (state.eva.showRunningRexOnly && theRunningRexEvaAsPlannedUuid) {
      // only show the running rex as-planned eva
      return state.eva.evas.filter((eva) => eva.uuid === theRunningRexEvaAsPlannedUuid);
    } else {
      // show all as-planned evas
      const allRexEvas = state.rex.rexes.map((rex) => rex.evaUuid);
      return state.eva.evas.filter((eva) => !allRexEvas.includes(eva.uuid));
    }
  }, deepEqual);
  const folderRecords = useAppSelector((state) => {
    const evaFolders = state.interface.folders.filter((f) => f.type === "eva");
    // when we are only showing the running rex we neeed to get rid of all the other folders and items
    if (state.eva.showRunningRexOnly && theRunningRexEvaAsPlannedUuid) {
      // only show the folder that contains the running rex eva
      const folderWithRunningRex = evaFolders.find((folder) =>
        folder.items?.includes(theRunningRexEvaAsPlannedUuid)
      );
      if (folderWithRunningRex) {
        // return the folder items with only the running rex
        return [
          {
            ...folderWithRunningRex,
            items: [theRunningRexEvaAsPlannedUuid],
          },
        ];
      }
      // the running rex isn't in any folder, so don't render any folders
      return [];
    }
    return evaFolders; // render all folders like normal
  }, deepEqual);
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
    <>
      <div className={evaStyles.titleWrapper} aria-label="evasSectionTitle">
        <div className={evaStyles.title} aria-label="leftPanelTitle">
          EVAs
        </div>
        {theRunningRexEvaAsPlannedUuid && (
          <Button
            ariaLabel={`${showRunningRexOnly ? "Show All EVAs" : "Show Executing EVA Only"}`}
            onClick={() => {
              dispatch(thunkSetOnlyShowRunningRexEva({ show: !showRunningRexOnly }));
            }}
            label={`${showRunningRexOnly ? "Show All EVAs" : "Show Executing EVA Only"}`}
            icon={faEye}
            style={{ paddingTop: 5, paddingBottom: 5, paddingLeft: 7, paddingRight: 7 }}
            labelStyle={{ paddingLeft: 5 }}
          />
        )}
      </div>
      <div className={paneStyles.leftPanelContainer}>
        <div className={paneStyles.leftPanelContainerTop} aria-label="evaList">
          <FolderOrganizer
            items={sortBy(asPlannedEvas, [(eva) => eva.name.toLowerCase()])}
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
                  if (selectedEvaUuid) {
                    dispatch(
                      thunkDuplicateEva({
                        evaUuid: selectedEvaUuid,
                        includeStations: false,
                        forRex: false,
                      })
                    );
                  }
                }}
                label="Duplicate"
                icon={faClone}
                enabled={!!selectedEvaUuid}
                style={{ width: "95px" }}
                toolTip="Duplicate this EVA and its Traverses"
              />
              <Button
                ariaLabel="duplicateEvaWithStations"
                onClick={() => {
                  if (selectedEvaUuid) {
                    if (
                      confirm(
                        "This will duplicate the EVA and also make duplicates of all stations in this EVA and will name them 'station name (copy X)'. Are you sure?"
                      )
                    ) {
                      dispatch(
                        thunkDuplicateEva({
                          evaUuid: selectedEvaUuid,
                          includeStations: true,
                          forRex: false,
                        })
                      );
                    }
                  }
                }}
                label="Dup w/ Stns"
                icon={faClone}
                enabled={!!selectedEvaUuid}
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
    </>
  );
};

export default EvaPlannerLeft;

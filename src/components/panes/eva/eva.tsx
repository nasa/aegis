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
import EvaRunningRex from "./eva-running-rex";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const isSelectedEvaUuidARex = useAppSelector(
    (state) => state.rex.rexes.some((rex) => rex.evaUuid === state.eva.selectedEvaUuid) || false,
    refEqual
  );
  const showRunningRexOnly = useAppSelector((state) => state.eva.showRunningRexOnly, refEqual);

  const isRexRunning = useAppSelector(
    (state) => state.rex.rexesFromDb.some((rex) => rex.isRunning),
    refEqual
  );

  const runningRexExpanded = useAppSelector((state) => state.eva.runningRexExpanded, refEqual);

  // these are the as-planned evas that are passed into the sub component to create the list of evas
  const asPlannedEvaUuids = useAppSelector((state) => {
    // show all as-planned evas
    const allRexEvas = state.rex.rexes.map((rex) => rex.evaUuid);
    return sortBy(
      state.eva.evas.filter((eva) => !allRexEvas.includes(eva.uuid)),
      [(eva) => eva.name?.toLowerCase()]
    ).map((eva) => eva.uuid);
  }, deepEqual);

  const folderRecords = useAppSelector((state) => {
    const evaFolders = state.interface.folders.filter((f) => f.type === "eva");

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

  const renderEvaItem = ({ itemUuid, first }: FolderItemProps) => {
    return (
      <div key={itemUuid} aria-label="evaList-item">
        <EvaItem evaUuid={itemUuid} first={first} />
      </div>
    );
  };

  let executingEvaContainerClass;
  if (showRunningRexOnly) {
    executingEvaContainerClass = evaStyles.executingEvaContainerOnly;
  } else if (runningRexExpanded) {
    executingEvaContainerClass = evaStyles.executingEvaContainer;
  } else {
    executingEvaContainerClass = evaStyles.executingEvaContainerCollapsed;
  }

  return (
    <>
      {isRexRunning && (
        <div className={executingEvaContainerClass}>
          <div className={evaStyles.titleWrapper} aria-label="evasSectionTitle">
            <div className={evaStyles.title} aria-label="leftPanelTitle">
              EXECUTING EVA
            </div>
            <Button
              ariaLabel={`${showRunningRexOnly ? "Show All EVAs" : "Show only Executing EVA"}`}
              onClick={() => {
                dispatch(thunkSetOnlyShowRunningRexEva({ show: !showRunningRexOnly }));
              }}
              label={`${showRunningRexOnly ? "Show All EVAs" : "Show only Executing EVA"}`}
              icon={faEye}
              style={{ paddingTop: 5, paddingBottom: 5, paddingLeft: 7, paddingRight: 7 }}
              labelStyle={{ paddingLeft: 5 }}
            />
          </div>
          <EvaRunningRex />
        </div>
      )}
      {!showRunningRexOnly && (
        <div
          className={
            !isRexRunning
              ? evaStyles.allEvaContainerNoExecuting
              : runningRexExpanded
                ? evaStyles.allEvaContainer
                : evaStyles.allEvaContainerRexCollapsed
          }
        >
          <div className={evaStyles.titleWrapper} aria-label="evasSectionTitle">
            <div className={evaStyles.title} aria-label="leftPanelTitle">
              EVAs
            </div>
          </div>
          <div className={paneStyles.leftPanelContainer}>
            <div className={paneStyles.leftPanelContainerTop} aria-label="evaList">
              <FolderOrganizer
                itemUuids={asPlannedEvaUuids}
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
                            isRexEva: false,
                          })
                        );
                      }
                    }}
                    label="Duplicate"
                    icon={faClone}
                    enabled={!!selectedEvaUuid && !isSelectedEvaUuidARex}
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
                              isRexEva: false,
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
        </div>
      )}
    </>
  );
};

export default EvaPlannerLeft;

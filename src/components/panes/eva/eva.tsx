import { useState, type FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import EvaItem from "./eva-item";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { faClone, faEye, faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { LoadingOverlay } from "components/interface/_global-elements";
import {
  thunkDocCreateEva,
  thunkDocDuplicateEva,
  thunkUISetOnlyShowRunningRexEva,
} from "store/thunk/thunkEva";
import { FolderOrganizer } from "components/interface/folders";
import { thunkAddRemoveFolderItem, thunkCreateFolder } from "store/thunk/thunkFolder";
import sortBy from "lodash/sortBy";
import EvaRunningRex from "./eva-running-rex";
import { useMissionDocSelector } from "utils/useDocSelector";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const [showOverlay, setShowOverlay] = useState<{ showOverlay: boolean; message?: string }>({
    showOverlay: false,
    message: "",
  });
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const showButtons = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );

  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const isSelectedEvaUuidARex = useMissionDocSelector(
    (mission) =>
      mission.rexes
        ? Object.values(mission.rexes).some((rex) => rex.evaUuid === selectedEvaUuid)
        : false,
    refEqual
  );
  const showRunningRexOnly = useAppSelector((state) => state.eva.showRunningRexOnly, refEqual);

  const isRexRunning = useMissionDocSelector(
    (mission) =>
      mission.rexes ? Object.values(mission.rexes).some((rex) => rex.isRunning) : false,
    refEqual
  );

  const runningRexExpanded = useAppSelector((state) => state.eva.runningRexExpanded, refEqual);

  // These are the as-planned evas that are passed into the sub component to create the list of evas
  const asPlannedEvaUuids =
    useMissionDocSelector((mission) => {
      if (!mission.evas || !mission.rexes) return [];
      // Show all as-planned evas
      const allRexEvas = Object.values(mission.rexes).map((rex) => rex.evaUuid);
      return sortBy(
        Object.values(mission.evas).filter((eva) => !allRexEvas.includes(eva.uuid)),
        [(eva) => eva.name?.toLowerCase()]
      ).map((eva) => eva.uuid);
    }, deepEqual) ?? [];

  const folderRecords = useAppSelector((state) => {
    return state.interface.folders.filter((f) => f.type === "eva");
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
    dispatch(thunkAddRemoveFolderItem({ folderUuid, itemUuid: uuid }));
  };

  const renderEvaItem = ({ itemUuid, first }: FolderItemProps) => {
    return (
      <div key={itemUuid} aria-label="evaList-item">
        <EvaItem asPlannedEvaUuid={itemUuid} first={first} />
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
                dispatch(thunkUISetOnlyShowRunningRexEva({ show: !showRunningRexOnly }));
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
              <div className={paneStyles.iconButtons}>
                {showButtons && (
                  <>
                    <Button
                      ariaLabel="addEva"
                      onClick={async () => {
                        setShowOverlay({ showOverlay: true, message: "Adding EVA..." });
                        try {
                          await dispatch(thunkDocCreateEva());
                        } finally {
                          setShowOverlay({ showOverlay: false });
                        }
                      }}
                      label="Add"
                      icon={faPlusCircle}
                      style={{ width: "65px" }}
                      toolTip="Add a new EVA"
                    />
                    <Button
                      ariaLabel="duplicateEva"
                      onClick={async () => {
                        if (selectedEvaUuid) {
                          setShowOverlay({ showOverlay: true, message: "Duplicating EVA..." });
                          try {
                            await dispatch(
                              thunkDocDuplicateEva({
                                evaUuid: selectedEvaUuid,
                                includeStations: false,
                                isRexEva: false,
                              })
                            );
                          } finally {
                            setShowOverlay({ showOverlay: false });
                          }
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
                      onClick={async () => {
                        if (selectedEvaUuid) {
                          if (
                            confirm(
                              "This will duplicate the EVA and also make duplicates of all stations in this EVA and will name them 'station name (copy X)'. Are you sure?"
                            )
                          ) {
                            setShowOverlay({
                              showOverlay: true,
                              message: "Duplicating EVA with Stations...",
                            });
                            try {
                              await dispatch(
                                thunkDocDuplicateEva({
                                  evaUuid: selectedEvaUuid,
                                  includeStations: true,
                                  isRexEva: false,
                                })
                              );
                            } finally {
                              setShowOverlay({ showOverlay: false });
                            }
                          }
                        }
                      }}
                      label="Dup w/ Stns"
                      icon={faClone}
                      enabled={!!selectedEvaUuid}
                      style={{ width: "110px" }}
                      toolTip="Duplicate this EVA and its Traverses and Stations"
                    />
                  </>
                )}
                {editPerms && (
                  <Button
                    ariaLabel="addFolder"
                    onClick={() => dispatch(thunkCreateFolder({ type: "eva" }))}
                    label="Folder"
                    icon={faFolderPlus}
                    style={{ width: "80px" }}
                    toolTip="Create a new folder"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showOverlay.showOverlay && <LoadingOverlay message={showOverlay.message} />}
    </>
  );
};

export default EvaPlannerLeft;

import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import posMenuStyles from "./map-menu-pos.module.css";
import {
  faBan,
  faChevronDown,
  faChevronUp,
  faCrosshairs,
  faFloppyDisk,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "../form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { shallowEqual, deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { thunkCancelPosEntryInEdit, thunkPersistPosEntries } from "store/thunk/thunkRexPosEntry";
import { clearPosEntryInEdit, setPosEntryInEdit, setSelectedPosEntryUuid } from "store/rex";
import { calculatePetValue, hhmmssFromSeconds, secondsFromhhmmss } from "utils/formatting";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { setHoverUuidsForPosEntry } from "store/hover";
import { PosKabobMenu } from "./map-menu-pos-menu";
import orderBy from "lodash/orderBy";
import isEqual from "lodash/isEqual";
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { updateMapDirective } from "store/map";
import { generateBlankPosEntry } from "store/storeUtils/rex";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";

export const MapPositionMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedRex = useAppSelector((state) => {
    return state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid);
  }, deepEqual);

  const allPosSources = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid)?.posSources,
    deepEqual
  );
  const allPosTypes = useAppSelector((state) => {
    return state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid)?.posTypes;
  }, deepEqual);

  const posEntries = useAppSelector((state) => {
    const posEntries = state.rex.rexes.find(
      (r) => r.uuid === state.rex.selectedRexUuid
    )?.posEntries;
    return orderBy(posEntries, ["createdAt"], "desc");
  }, deepEqual);

  const posEntryInEdit = useAppSelector((state) => state.rex.posEntryInEdit, deepEqual);

  const editingPosEntryFromDb = useAppSelector(
    (state) =>
      state.rex.rexesFromDb
        .find((r) => r.uuid === state.rex.selectedRexUuid)
        ?.posEntries?.find((c) => c.uuid === posEntryInEdit?.uuid),
    deepEqual
  );

  const evaAndRexName = useAppSelector((state) => {
    const selectedRex = state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid);
    const selectedEva = state.eva.evas.find((e) => e.uuid === selectedRex?.evaUuid);
    const asPlannedEva = getAsPlannedEvaFromRefUuid(state, selectedEva.refUuid);
    return `${asPlannedEva?.name} - ${selectedRex?.name}`;
  }, refEqual);

  const selectedRexIsExecuting = useAppSelector((state) => {
    const selectedRex = state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid);
    return selectedRex?.isRunning;
  }, refEqual);

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === posEntryInEdit?.uuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const thisMapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const [showPosList, setShowPosList] = useState(false);
  const [showMenu, setShowMenu] = useState(true);

  // reset the pos entry in edit when pos source or pos type list changes
  // this covers when the rex selection changes too
  useEffect(() => {
    // Reset all the values in posEntryInEdit
    const nullPosEntry: PosEntry = {
      uuid: null,
      location: null,
      elevation: null,
      petSeconds: null,
      posTypeUuids: [],
      posSourceUuid: null,
      createdAt: null,
      updatedAt: null,
    };

    // set a default source
    const taskUuid = allPosSources.find((s) => s.name === "Task")?.uuid || null;
    if (taskUuid) {
      dispatch(setPosEntryInEdit({ ...nullPosEntry, posSourceUuid: taskUuid }));
    } else if (allPosSources[0]) {
      // no task, so pick the first source in the list
      dispatch(setPosEntryInEdit({ ...nullPosEntry, posSourceUuid: allPosSources[0].uuid }));
    }
  }, [allPosTypes, allPosSources, dispatch]);

  const modified = posEntryInEdit && !isEqual([posEntryInEdit], [editingPosEntryFromDb]);

  // track the last pos entry for each pos type to determine which items to show in the top list
  const posTypeLastEntryUuids: { [key: string]: string } = {};
  posEntries.forEach((posEntry) => {
    posEntry.posTypeUuids.forEach((posTypeUuid) => {
      if (!posTypeLastEntryUuids[posTypeUuid]) {
        posTypeLastEntryUuids[posTypeUuid] = posEntry.uuid;
      }
    });
  });
  const posEntriesTopList: PosEntry[] = [];
  posEntries.forEach((posEntry) => {
    const posEntryInLatest = posEntry.posTypeUuids.some(
      (posTypeUuid) => posTypeLastEntryUuids[posTypeUuid] === posEntry.uuid
    );
    if (posEntryInLatest) {
      posEntriesTopList.push(posEntry);
    }
  });

  const posMapClass = selectedRexIsExecuting
    ? posMenuStyles.mapPosDisplayExecuting
    : posMenuStyles.mapPosDisplay;

  return (
    <div className={posMenuStyles.mapPosDisplayContainer}>
      <div
        className={`${posMapClass} ${showMenu ? posMenuStyles.menuOpen : posMenuStyles.menuClosed}`}
      >
        {!showMenu && (
          <div
            className={posMenuStyles.menuIcon}
            onClick={(e) => {
              setShowMenu(!showMenu);
              e.stopPropagation();
            }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html="Map View Settings"
          >
            <FontAwesomeIcon
              icon={faCrosshairs}
              size="sm"
              style={{ marginTop: "3px", width: "15px", color: "var(--grey5)", outline: "none" }}
              tabIndex={0}
            />
            <div className={posMenuStyles.bottomTriangle} />
          </div>
        )}

        <div className={`${!showMenu && posMenuStyles.hideMenu} ${posMenuStyles.menuContainer}`}>
          <div className={posMenuStyles.titleContainer}>
            {evaAndRexName}
            <div
              className={posMenuStyles.menuIconOpen}
              onClick={(e) => {
                setShowMenu(!showMenu);
                e.stopPropagation();
              }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="Map View Settings"
            >
              <FontAwesomeIcon
                icon={showMenu ? faXmark : faCrosshairs}
                size="sm"
                style={{
                  cursor: "pointer",
                  marginTop: "3px",
                  width: "15px",
                  color: "var(--grey5)",
                  outline: "none",
                }}
                tabIndex={0}
              />
              <div className={posMenuStyles.topTriangle} />
            </div>
          </div>
          <div
            className={`${editPerms ? posMenuStyles.buttonContainer : posMenuStyles.viewOnlyButtonContainer}`}
          >
            {editPerms && (
              <>
                <div className={posMenuStyles.toggleContainer}>
                  {allPosTypes?.map((posType, index) => {
                    let toggleStyle = posMenuStyles.toggleMiddle;
                    if (index === 0) {
                      toggleStyle = posMenuStyles.toggleLeft;
                    } else if (index === allPosTypes.length - 1) {
                      toggleStyle = posMenuStyles.toggleRight;
                    }
                    return (
                      <div
                        key={posType.uuid}
                        className={`${toggleStyle} ${posMenuStyles.center} ${
                          posEntryInEdit?.posTypeUuids?.includes(posType.uuid) &&
                          posMenuStyles.toggleSelected
                        }`}
                        onClick={() => {
                          if (!selectedRex) return;
                          const currentPosTypeUuids = posEntryInEdit?.posTypeUuids || [];
                          if (currentPosTypeUuids.includes(posType.uuid)) {
                            // Remove the posType.uuid if it's already selected
                            dispatch(
                              setPosEntryInEdit({
                                ...posEntryInEdit,
                                posTypeUuids: currentPosTypeUuids.filter(
                                  (uuid) => uuid !== posType.uuid
                                ),
                              })
                            );
                          } else {
                            // Add the posType.uuid
                            dispatch(
                              setPosEntryInEdit({
                                ...posEntryInEdit,
                                posTypeUuids: [...currentPosTypeUuids, posType.uuid],
                              })
                            );
                          }
                        }}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={posType.name}
                        style={{
                          cursor: selectedRex.isRunning ? "pointer" : "default",
                          // if rex is running, use color from the className
                          ...(selectedRex.isRunning ? {} : { color: "var(--grey4)" }),
                        }}
                      >
                        {posType.abbr}
                      </div>
                    );
                  })}
                  <div className={posMenuStyles.setPosButton}>
                    {thisMapAction === null && (
                      <Button
                        onClick={async () => {
                          if (posEntryInEdit?.createdAt) {
                            // edit an existing position entry
                            await dispatch(
                              thunkUpdateMapDirective({
                                mapItemType: "posEntry",
                                uuid: posEntryInEdit.uuid,
                                mapAction: "editMarker",
                              })
                            );
                          } else {
                            // clicking the "new pos" will set the uuid, petSeconds, and createdAt/updatedAt dates
                            const seconds = secondsFromhhmmss(
                              selectedRex.petRunning
                                ? calculatePetValue(selectedRex)
                                : selectedRex.petValueAtStartStop
                            );
                            const newPosEntry = generateBlankPosEntry({
                              petSeconds: seconds,
                              posTypeUuids: posEntryInEdit.posTypeUuids,
                              posSourceUuid: posEntryInEdit.posSourceUuid,
                            });
                            dispatch(setPosEntryInEdit(newPosEntry));
                            await dispatch(
                              thunkUpdateMapDirective({
                                mapItemType: "posEntry",
                                uuid: newPosEntry.uuid,
                                mapAction: "createMarker",
                              })
                            );
                          }
                        }}
                        label={posEntryInEdit?.location ? "Edit Pos." : "New Pos."}
                        icon={faCrosshairs}
                        style={{ height: "1.75em", width: "90px", marginLeft: 0 }}
                        enabled={posEntryInEdit?.posTypeUuids?.length > 0 && selectedRex.isRunning}
                      />
                    )}
                    {(thisMapAction === "createMarker" || thisMapAction === "editMarker") && (
                      <Button
                        onClick={() => {
                          // Cancel out map actions
                          if (thisMapAction === "createMarker") {
                            dispatch(
                              updateMapDirective({
                                mapItemType: "posEntry",
                                uuid: posEntryInEdit.uuid,
                                mapAction: "cancelCreateMarker",
                              })
                            );
                          } else if (thisMapAction === "editMarker") {
                            dispatch(
                              updateMapDirective({
                                mapItemType: "posEntry",
                                uuid: posEntryInEdit.uuid,
                                mapAction: "cancelEditMarker",
                              })
                            );
                          }
                          // clear out the pos entry in edit by replacing it with a blank one
                          dispatch(clearPosEntryInEdit());
                        }}
                        icon={faBan}
                        label="Cancel Pos."
                        style={{ height: "1.75em", width: "100px", marginLeft: 0 }}
                      />
                    )}
                  </div>
                  {posEntryInEdit?.location && (
                    <div className={posMenuStyles.saveCancelButtons}>
                      <div>
                        <Button
                          onClick={async () => {
                            // update selected types and source
                            await dispatch(thunkPersistPosEntries({ rexUuid: selectedRex.uuid }));
                          }}
                          icon={faFloppyDisk}
                          toolTip={`Save Position Markers ${modified ? "" : " (nothing to save)"}`}
                          enabled={modified && posEntryInEdit?.posTypeUuids?.length > 0}
                          style={{
                            height: "1.75em",
                            backgroundColor:
                              modified && posEntryInEdit?.posTypeUuids?.length > 0
                                ? "var(--alert)"
                                : "var(--alert-disabled)",
                            color:
                              modified && posEntryInEdit?.posTypeUuids?.length > 0
                                ? "white"
                                : "var(--grey4)",
                          }}
                        />
                      </div>
                      <div>
                        <Button
                          onClick={() => {
                            dispatch(clearPosEntryInEdit());
                          }}
                          icon={faBan}
                          toolTip="Cancel Edit"
                          style={{ height: "1.75em" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className={posMenuStyles.toggleContainer}>
                  <div className={posMenuStyles.sourceText}>Source:</div>
                  {allPosSources?.map((posSource, index) => {
                    // set style
                    let toggleStyle = posMenuStyles.toggleMiddle;
                    if (index === 0) {
                      toggleStyle = posMenuStyles.toggleLeft;
                    } else if (index === allPosSources.length - 1) {
                      toggleStyle = posMenuStyles.toggleRight;
                    }
                    return (
                      <div
                        key={posSource.uuid}
                        className={`${toggleStyle} ${posMenuStyles.center} ${
                          selectedRex.isRunning &&
                          posEntryInEdit?.posSourceUuid === posSource.uuid &&
                          posMenuStyles.toggleSelected
                        }`}
                        onClick={() => {
                          dispatch(
                            setPosEntryInEdit({
                              ...posEntryInEdit,
                              posSourceUuid: posSource.uuid,
                            })
                          );
                        }}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={posSource.name}
                        style={{
                          cursor: selectedRex.isRunning ? "pointer" : "default",
                          // if rex is running, use color from the className
                          ...(selectedRex.isRunning ? {} : { color: "var(--grey4)" }),
                        }}
                      >
                        {posSource.abbr}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className={posMenuStyles.posTableContainer}>
            <table className={posMenuStyles.posTable}>
              <thead>
                <tr className={posMenuStyles.historicPosHeader}>
                  <td>#</td>
                  <td className={posMenuStyles.petColumn}>PET</td>
                  <td className={posMenuStyles.markerColumn}>Markers</td>
                  <td>
                    Lander
                    <br />
                    Dist. (m)
                  </td>
                  <td>
                    WB Dur.
                    <br />
                    (mins)
                  </td>
                  <td>Src</td>
                </tr>
              </thead>
              <tbody>
                {posEntries?.length > 0 && (
                  <>
                    {posEntries.map((posEntry, index) => {
                      if (!posEntriesTopList.includes(posEntry)) return null;

                      return (
                        <PositionRow
                          key={posEntry.uuid}
                          posEntry={posEntry}
                          showKabob={editPerms && selectedRex.isRunning}
                          numbering={posEntries.length - index}
                          isEditing={posEntryInEdit?.uuid === posEntry.uuid}
                        />
                      );
                    })}
                  </>
                )}
                <tr>
                  <td
                    className={posMenuStyles.historicPosTitle}
                    onClick={() => {
                      setShowPosList(!showPosList);
                    }}
                    colSpan={5}
                  >
                    All Positions
                    <FontAwesomeIcon
                      icon={showPosList ? faChevronDown : faChevronUp}
                      size="sm"
                      style={{ paddingLeft: "5px" }}
                    />
                  </td>
                </tr>
                {showPosList && posEntries && (
                  <>
                    {posEntries.map((posEntry, index, posEntries) => {
                      return (
                        <PositionRow
                          key={posEntry.uuid}
                          posEntry={posEntry}
                          showKabob={editPerms && selectedRex.isRunning}
                          numbering={posEntries.length - index}
                          isEditing={posEntryInEdit?.uuid === posEntry.uuid}
                        />
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PositionRow: FunctionComponent<{
  posEntry: PosEntry;
  showKabob: boolean;
  numbering: number;
  isEditing: boolean;
}> = ({ posEntry, showKabob, numbering, isEditing }) => {
  const dispatch = useAppDispatch();
  const partialMission = useMissionDocSelector(
    (doc) => ({
      landerLocation: doc.landerLocation,
      planetRadius: doc.planetRadius,
      traverseRate: doc.traverseRate,
    }),
    deepEqual
  );

  let distanceToLander = null;
  if (partialMission.landerLocation && partialMission.planetRadius) {
    distanceToLander = +getDistanceBetweenTwoCoordinates(
      posEntry.location,
      partialMission.landerLocation,
      partialMission.planetRadius
    );
  }

  const duration = useAppSelector((state) => {
    if (distanceToLander === null) return null;
    const eva = state.eva.evas.find((e) => e.uuid === state.eva.selectedEvaUuid);
    const traverseRate = eva?.traverseRate ? eva.traverseRate : partialMission.traverseRate;
    return Math.ceil(calcPathDurationMins([distanceToLander], traverseRate));
  }, refEqual);

  const isSelected = useAppSelector(
    (state) => state.rex.selectedPosEntryUuid === posEntry.uuid,
    refEqual
  );
  const isHovered = useAppSelector(
    (state) => state.hover.posEntryItemUuid === posEntry.uuid,
    refEqual
  );

  const sourceAbbr = useAppSelector((state) => {
    const selectedRex = state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid);
    return selectedRex?.posSources?.find((s) => s.uuid === posEntry.posSourceUuid)?.abbr;
  }, refEqual);

  const posNameList = useAppSelector((state) => {
    const selectedRex = state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid);
    return posEntry.posTypeUuids?.map((uuid) => {
      const posType = selectedRex?.posTypes?.find((p) => p.uuid === uuid);
      return posType?.name;
    });
  }, deepEqual);

  let itemStyle = null;
  if (isSelected) {
    itemStyle = posMenuStyles.historicPosItemSelected;
  } else if (isHovered) {
    itemStyle = posMenuStyles.historicPosItemHover;
  }

  return (
    <>
      {posEntry && (
        <tr
          key={posEntry.uuid}
          className={`${posMenuStyles.historicPosItem} ${
            !posEntry.location && posMenuStyles.historicPosItemPending
          } ${itemStyle}`}
          onMouseEnter={() => {
            dispatch(setHoverUuidsForPosEntry(posEntry.uuid));
          }}
          onMouseLeave={() => {
            dispatch(setHoverUuidsForPosEntry(null));
          }}
          onClick={async () => {
            //cancel out anything currently in edit
            await dispatch(thunkCancelPosEntryInEdit());

            if (isSelected) {
              dispatch(setSelectedPosEntryUuid(null));
            } else {
              dispatch(setSelectedPosEntryUuid(posEntry.uuid));
              dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
            }
          }}
        >
          <td className={`${posMenuStyles.historicPosItemNumber}`}>{numbering}</td>
          <td className={posMenuStyles.petColumn}>{hhmmssFromSeconds(posEntry.petSeconds)}</td>
          <td className={`${posMenuStyles.crewColumn}`}>{posNameList?.join(", ")}</td>
          <td>{!isNaN(distanceToLander) ? distanceToLander.toFixed(2) : "Not Set"}</td>
          <td>{!isNaN(duration) ? duration : "Not Set"}</td>
          <td>{sourceAbbr}</td>
          <td
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {showKabob && (
              <PosKabobMenu posEntry={posEntry} isSelected={isSelected} isEditing={isEditing} />
            )}
          </td>
        </tr>
      )}
    </>
  );
};

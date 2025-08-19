import { Dispatch, FunctionComponent, SetStateAction, useEffect, useState } from "react";
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
import {
  thunkCancelPosEntry,
  thunkCancelPosEntryLocation,
  thunkCreatePosEntry,
  thunkPersistPosEntries,
  thunkUpdatePosTypesOnPosEntry,
} from "store/thunk/thunkRexPosEntry";
import { thunkUpdatePosSourceOnPosEntry } from "store/thunk/thunkRexPosSource";
import {
  setPosEntryEditingUuid,
  setSelectedPosEntryUuid,
  setSelectedPosSourceUuid,
} from "store/rex";
import { hhmmssFromSeconds } from "utils/formatting";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { setHoverUuidsForPosEntry } from "store/hover";
import { PosKabobMenu } from "./map-menu-pos-menu";
import orderBy from "lodash/orderBy";
import isEqual from "lodash/isEqual";
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";

export const MapPositionMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const isRexEditing = useAppSelector((state) => {
    const rexEvaUuid = state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid)?.evaUuid;
    return state.eva.evasEditing.includes(rexEvaUuid);
  }, refEqual);
  const canAddEditPosLocation = useAppSelector((state) => {
    // for adding new pos rex must be running and not in edit. for editing existing pos, rex just must not be in edit
    if (state.rex.posEntryEditingUuid) {
      return !isRexEditing;
    } else {
      const isRexRunning = state.rex.rexesFromDb.find(
        (r) => r.uuid === state.rex.selectedRexUuid
      )?.isRunning;
      return !isRexEditing && isRexRunning;
    }
  }, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedPosSourceUuid = useAppSelector(
    (state) => state.rex.selectedPosSourceUuid,
    refEqual
  );

  const posSources = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid)?.posSources,
    deepEqual
  );
  const posSourcesFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid)?.posSources,
    deepEqual
  );
  const posTypes = useAppSelector((state) => {
    const posTypes = state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid)?.posTypes;
    return posTypes;
  }, deepEqual);

  const posEntries = useAppSelector((state) => {
    const posEntries = state.rex.rexes.find(
      (r) => r.uuid === state.rex.selectedRexUuid
    )?.posEntries;
    return orderBy(posEntries, ["createdAt"], "desc");
  }, deepEqual);
  const posEntryEditingUuid = useAppSelector((state) => state.rex.posEntryEditingUuid, refEqual);
  const posEntriesInEdit = posEntries.find((c) => c.uuid === posEntryEditingUuid);
  const editingPosEntry = useAppSelector(
    (state) =>
      state.rex.rexes
        .find((r) => r.uuid === state.rex.selectedRexUuid)
        ?.posEntries?.find((c) => c.uuid === state.rex.posEntryEditingUuid),
    shallowEqual
  );
  const editingPosEntryFromDb = useAppSelector(
    (state) =>
      state.rex.rexesFromDb
        .find((r) => r.uuid === state.rex.selectedRexUuid)
        ?.posEntries?.find((c) => c.uuid === state.rex.posEntryEditingUuid),
    deepEqual
  );

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === posEntryEditingUuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const thisMapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const evaAndRexName = useAppSelector((state) => {
    const selectedRex = state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid);
    const selectedEva = state.eva.evas.find((e) => e.uuid === selectedRex?.evaUuid);
    return `${selectedEva?.name} - ${selectedRex?.name}`;
  }, refEqual);

  const selectedRexIsExecuting = useAppSelector((state) => {
    const selectedRex = state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid);
    return selectedRex?.isRunning;
  }, refEqual);

  const [selectedPosTypeUuids, setSelectedPosTypeUuids] = useState<string[]>([]);
  const [showPosList, setShowPosList] = useState(false);
  const [showMenu, setShowMenu] = useState(true);

  //clear the selected pos type uuids when the selected rex uuid changes or when the posType list changes
  useEffect(() => {
    setSelectedPosTypeUuids([]);
  }, [selectedRexUuid, posTypes]);

  //set a default source when the rex selection changes.
  useEffect(() => {
    const taskUuid = posSources.find((s) => s.name === "Task")?.uuid || null;
    if (taskUuid) {
      dispatch(setSelectedPosSourceUuid(taskUuid));
      return;
    }
    // no task, so pick the first source in the list
    if (posSources[0]) dispatch(setSelectedPosSourceUuid(posSources[0].uuid));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRexUuid]);

  const modified = !isEqual([editingPosEntry], [editingPosEntryFromDb]);

  const togglePosType = async (posTypeUuid: string) => {
    let newSelectedPosTypeUuids: string[] = [];
    if (selectedPosTypeUuids.includes(posTypeUuid)) {
      newSelectedPosTypeUuids = selectedPosTypeUuids.filter((i) => i !== posTypeUuid);
    } else {
      for (let i = 0; i < posTypes.length; i++) {
        if (selectedPosTypeUuids.includes(posTypes[i].uuid) || posTypes[i].uuid === posTypeUuid) {
          newSelectedPosTypeUuids.push(posTypes[i].uuid);
        }
      }
    }
    setSelectedPosTypeUuids(newSelectedPosTypeUuids);
    if (!editingPosEntry) return;
    await dispatch(
      thunkUpdatePosTypesOnPosEntry({
        rexUuid: selectedRexUuid,
        posEntryUuid: posEntryEditingUuid,
        posTypeUuids: newSelectedPosTypeUuids,
      })
    );
  };

  const togglePosSource = async (posSourceUuid: string) => {
    dispatch(setSelectedPosSourceUuid(posSourceUuid));

    if (!editingPosEntry) return;
    await dispatch(
      thunkUpdatePosSourceOnPosEntry({
        rexUuid: selectedRexUuid,
        posEntryUuid: posEntryEditingUuid,
        posSourceUuid,
      })
    );
  };

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

  //create a new position entry
  const handleCreate = async () => {
    const newUuid = (await dispatch(thunkCreatePosEntry({ posTypeUuids: selectedPosTypeUuids })))
      .payload;
    if (newUuid) {
      dispatch(
        thunkUpdateMapDirective({
          mapItemType: "posEntry",
          uuid: newUuid,
          mapAction: "createMarker",
        })
      );
    }
  };
  const handlePositionEdit = async (posEditingUuid: string) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "posEntry",
        uuid: posEditingUuid,
        mapAction: "editMarker",
      })
    );
  };

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
                  {posTypes?.map((posType, index) => {
                    let toggleStyle = posMenuStyles.toggleMiddle;
                    if (index === 0) {
                      toggleStyle = posMenuStyles.toggleLeft;
                    } else if (index === posTypes.length - 1) {
                      toggleStyle = posMenuStyles.toggleRight;
                    }
                    return (
                      <div
                        key={posType.uuid}
                        className={`${toggleStyle} ${posMenuStyles.center} ${
                          selectedPosTypeUuids.includes(posType.uuid) &&
                          posMenuStyles.toggleSelected
                        }`}
                        onClick={() => {
                          togglePosType(posType.uuid);
                        }}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={posType.name}
                      >
                        {posType.abbr}
                      </div>
                    );
                  })}
                  <div className={posMenuStyles.setPosButton}>
                    {thisMapAction === null && (
                      <Button
                        onClick={async () => {
                          if (posEntryEditingUuid) {
                            await handlePositionEdit(posEntryEditingUuid);
                          } else {
                            await handleCreate();
                          }
                        }}
                        label={posEntryEditingUuid ? "Edit Pos." : "New Pos."}
                        icon={faCrosshairs}
                        style={{ height: "1.75em", width: "90px", marginLeft: 0 }}
                        enabled={selectedPosTypeUuids.length > 0 && canAddEditPosLocation}
                      />
                    )}
                    {(thisMapAction === "createMarker" || thisMapAction === "editMarker") && (
                      <Button
                        onClick={() => {
                          dispatch(thunkCancelPosEntryLocation({ posEntryEditingUuid }));
                          if (thisMapAction === "createMarker") {
                            dispatch(setPosEntryEditingUuid(null));
                          }
                        }}
                        icon={faBan}
                        label="Cancel Pos."
                        style={{ height: "1.75em", width: "100px", marginLeft: 0 }}
                      />
                    )}
                  </div>
                  {posEntriesInEdit?.location && (
                    <div className={posMenuStyles.saveCancelButtons}>
                      <div>
                        <Button
                          onClick={async () => {
                            await dispatch(
                              thunkUpdatePosTypesOnPosEntry({
                                rexUuid: selectedRexUuid,
                                posEntryUuid: posEntryEditingUuid,
                                posTypeUuids: selectedPosTypeUuids,
                              })
                            );
                            await dispatch(thunkPersistPosEntries({ rexUuid: selectedRexUuid }));
                          }}
                          icon={faFloppyDisk}
                          toolTip={`Save Position Markers ${modified ? "" : " (nothing to save)"}`}
                          enabled={modified && selectedPosTypeUuids.length > 0}
                          style={{
                            height: "1.75em",
                            backgroundColor:
                              modified && selectedPosTypeUuids.length > 0
                                ? "var(--alert)"
                                : "var(--alert-disabled)",
                            color:
                              modified && selectedPosTypeUuids.length > 0
                                ? "white"
                                : "var(--grey4)",
                          }}
                        />
                      </div>
                      <div>
                        <Button
                          onClick={() => {
                            dispatch(thunkCancelPosEntry({ posEntryUuid: posEntryEditingUuid }));
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
                  {posSourcesFromDb?.map((posSource, index) => {
                    let toggleStyle = posMenuStyles.toggleMiddle;
                    if (index === 0) {
                      toggleStyle = posMenuStyles.toggleLeft;
                    } else if (index === posSourcesFromDb.length - 1) {
                      toggleStyle = posMenuStyles.toggleRight;
                    }
                    return (
                      <div
                        key={posSource.uuid}
                        className={`${toggleStyle} ${posMenuStyles.center} ${
                          selectedPosSourceUuid === posSource.uuid && posMenuStyles.toggleSelected
                        }`}
                        onClick={() => {
                          togglePosSource(posSource.uuid);
                        }}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={posSource.name}
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
                          showKabob={editPerms && !isRexEditing}
                          numbering={posEntries.length - index}
                          setSelectedPosTypes={setSelectedPosTypeUuids}
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
                          showKabob={editPerms && !isRexEditing}
                          numbering={posEntries.length - index}
                          setSelectedPosTypes={setSelectedPosTypeUuids}
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
  setSelectedPosTypes: Dispatch<SetStateAction<string[]>>;
}> = ({ posEntry, showKabob, numbering, setSelectedPosTypes }) => {
  const dispatch = useAppDispatch();

  const landerLocation = useAppSelector(
    (state) => state.mission.mission.landerLocation,
    shallowEqual
  );
  const traverseRate = useAppSelector((state) => {
    const eva = state.eva.evas.find((e) => e.uuid === state.eva.selectedEvaUuid);
    if (eva?.traverseRate) {
      return eva.traverseRate;
    } else {
      return state.mission.mission.traverseRate;
    }
  }, refEqual);
  const radius = useAppSelector((state) => state.mission.mission.planetRadius, refEqual);

  const isSelected = useAppSelector(
    (state) => state.rex.selectedPosEntryUuid === posEntry.uuid,
    refEqual
  );
  const isHovered = useAppSelector(
    (state) => state.hover.posEntryItemUuid === posEntry.uuid,
    refEqual
  );
  const isEditing = useAppSelector(
    (state) => state.rex.posEntryEditingUuid === posEntry.uuid,
    refEqual
  );
  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid),
    deepEqual
  );
  const sourceAbbr = selectedRex?.posSources?.find((s) => s.uuid === posEntry.posSourceUuid)?.abbr;

  const posNameList = posEntry.posTypeUuids?.map((uuid) => {
    const posType = selectedRex?.posTypes?.find((p) => p.uuid === uuid);
    return posType?.name;
  });

  const [dist, setDist] = useState(null);
  const [duration, setDuration] = useState(null);
  const [itemStyle, setItemStyle] = useState(null);

  //determine styling
  useEffect(() => {
    if (isSelected) {
      setItemStyle(posMenuStyles.historicPosItemSelected);
    } else if (isHovered) {
      setItemStyle(posMenuStyles.historicPosItemHover);
    } else {
      setItemStyle(null);
    }
  }, [posEntry.uuid, isHovered, isSelected]);

  //calculate distance and duration for this crew position location
  useEffect(() => {
    if (posEntry.location && landerLocation && radius && traverseRate) {
      const newDistance = +getDistanceBetweenTwoCoordinates(
        posEntry.location,
        landerLocation,
        radius
      );
      setDist(newDistance.toFixed(2));
      setDuration(Math.round(calcPathDurationMins([newDistance], traverseRate)));
    } else {
      setDist(null);
      setDuration(null);
    }
  }, [posEntry.location, landerLocation, radius, traverseRate]);

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
            await dispatch(thunkCancelPosEntry({ posEntryUuid: posEntry.uuid }));

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
          <td>{!isNaN(dist) ? dist : "Not Set"}</td>
          <td>{!isNaN(duration) ? duration : "Not Set"}</td>
          <td>{sourceAbbr}</td>
          <td
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {showKabob && (
              <PosKabobMenu
                posEntry={posEntry}
                isSelected={isSelected}
                isEditing={isEditing}
                setSelectedPosTypes={setSelectedPosTypes}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
};

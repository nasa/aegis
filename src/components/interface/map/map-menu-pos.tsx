import { Dispatch, FunctionComponent, SetStateAction, useEffect, useState } from "react";
import styles from "./map-menu-pos.module.css";
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
  thunkPersistRexPosEntries,
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
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";

export const MapPositionMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const isRexEditing = useAppSelector(
    (state) => state.rex.rexesEditing.includes(state.rex.selectedRexUuid),
    refEqual
  );
  const canAddEditPosLocation = useAppSelector((state) => {
    // for adding new pos rex must be running and not in edit. for editing existing pos, rex just must not be in edit
    const isRexEditing = state.rex.rexesEditing.includes(state.rex.selectedRexUuid);
    if (state.rex.posEntryEditingUuid) {
      return !isRexEditing;
    } else {
      const isRexRunning = state.rex.rexesFromDb.find(
        (r) => r.uuid === state.rex.selectedRexUuid
      )?.isRunning;
      return !isRexEditing && isRexRunning;
    }
  }, refEqual);
  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid),
    deepEqual
  );
  const posSourcesFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid)?.posSources,
    deepEqual
  );
  const posEntries = useAppSelector((state) => {
    const posEntries = state.rex.rexes.find((r) => r.uuid === selectedRex?.uuid)?.posEntries;
    return orderBy(posEntries, ["createdAt"], "desc");
  }, deepEqual);

  const posTypes = useAppSelector((state) => {
    const posTypes = state.rex.rexes.find((r) => r.uuid === selectedRex?.uuid)?.posTypes;
    return posTypes;
  }, deepEqual);

  const posEntryEditingUuid = useAppSelector((state) => state.rex.posEntryEditingUuid, refEqual);
  const posEntriesInEdit = posEntries.find((c) => c.uuid === posEntryEditingUuid);
  const editingPosEntry = useAppSelector(
    (state) =>
      state.rex.rexes
        .find((r) => r.uuid === selectedRex?.uuid)
        ?.posEntries?.find((c) => c.uuid === state.rex.posEntryEditingUuid),
    shallowEqual
  );
  const editingPosEntryFromDb = useAppSelector(
    (state) =>
      state.rex.rexesFromDb
        .find((r) => r.uuid === selectedRex?.uuid)
        ?.posEntries?.find((c) => c.uuid === state.rex.posEntryEditingUuid),
    deepEqual
  );

  const selectedRexUuid = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid).uuid,
    refEqual
  );
  const selectedRexPosTypes = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid).posTypes,
    deepEqual
  );
  const selectedPosSourceUuid = useAppSelector(
    (state) => state.rex.selectedPosSourceUuid,
    refEqual
  );

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === posEntryEditingUuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const thisMapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const [selectedPosTypeUuids, setSelectedPosTypeUuids] = useState<string[]>([]);
  const [showPosList, setShowPosList] = useState(false);
  const [showMenu, setShowMenu] = useState(true);

  //clear the selected pos type uuids when the selected rex uuid changes or when the posType list changes
  useEffect(() => {
    setSelectedPosTypeUuids([]);
  }, [selectedRexUuid, selectedRexPosTypes]);

  //set a default source when the rex selection changes.
  useEffect(() => {
    const taskUuid = selectedRex?.posSources.find((s) => s.name === "Task")?.uuid || null;
    if (taskUuid) {
      dispatch(setSelectedPosSourceUuid(taskUuid));
      return;
    }
    // no task, so pick the first source in the list
    if (selectedRex?.posSources[0]) {
      dispatch(setSelectedPosSourceUuid(selectedRex.posSources[0].uuid));
    }
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
        rex: selectedRex,
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
        rex: selectedRex,
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
  return (
    <div className={styles.mapPosDisplayContainer}>
      <div className={`${styles.mapPosDisplay} ${showMenu ? styles.menuOpen : styles.menuClosed}`}>
        {!showMenu && (
          <div
            className={styles.menuIcon}
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
            <div className={styles.bottomTriangle} />
          </div>
        )}

        <div className={`${!showMenu && styles.hideMenu} ${styles.menuContainer}`}>
          <div
            className={`${editPerms ? styles.buttonContainer : styles.viewOnlyButtonContainer}`}
            style={{ cursor: "pointer", marginBottom: "10px" }}
          >
            {editPerms && (
              <>
                <div className={styles.toggleContainer}>
                  {selectedRex?.posTypes?.map((posType, index) => {
                    let toggleStyle = styles.toggleMiddle;
                    if (index === 0) {
                      toggleStyle = styles.toggleLeft;
                    } else if (index === selectedRex?.posTypes.length - 1) {
                      toggleStyle = styles.toggleRight;
                    }
                    return (
                      <div
                        key={posType.uuid}
                        className={`${toggleStyle} ${styles.center} ${
                          selectedPosTypeUuids.includes(posType.uuid) && styles.toggleSelected
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
                  <div className={styles.setPosButton}>
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
                    <div className={styles.saveCancelButtons}>
                      <div>
                        <Button
                          onClick={async () => {
                            await dispatch(
                              thunkUpdatePosTypesOnPosEntry({
                                rex: selectedRex,
                                posEntryUuid: posEntryEditingUuid,
                                posTypeUuids: selectedPosTypeUuids,
                              })
                            );
                            await dispatch(
                              thunkPersistRexPosEntries({ rexUuid: selectedRex?.uuid })
                            );
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
                <div className={styles.toggleContainer}>
                  <div className={styles.sourceText}>Source:</div>
                  {posSourcesFromDb?.map((posSource, index) => {
                    let toggleStyle = styles.toggleMiddle;
                    if (index === 0) {
                      toggleStyle = styles.toggleLeft;
                    } else if (index === posSourcesFromDb.length - 1) {
                      toggleStyle = styles.toggleRight;
                    }
                    return (
                      <div
                        key={posSource.uuid}
                        className={`${toggleStyle} ${styles.center} ${
                          selectedPosSourceUuid === posSource.uuid && styles.toggleSelected
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
            <div
              className={styles.menuIconOpen}
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
                style={{ marginTop: "3px", width: "15px", color: "var(--grey5)", outline: "none" }}
                tabIndex={0}
              />
              <div className={styles.topTriangle} />
            </div>
          </div>
          <div className={styles.posTableContainer}>
            <table className={styles.posTable}>
              <thead>
                <tr className={styles.historicPosHeader}>
                  <td>#</td>
                  <td className={styles.petColumn}>PET</td>
                  <td className={styles.markerColumn}>Markers</td>
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
                    className={styles.historicPosTitle}
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
      setItemStyle(styles.historicPosItemSelected);
    } else if (isHovered) {
      setItemStyle(styles.historicPosItemHover);
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
      ).toFixed(2);
      setDist(newDistance);
      setDuration(calcPathDurationMins([newDistance], traverseRate).toFixed(2));
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
          className={`${styles.historicPosItem} ${
            !posEntry.location && styles.historicPosItemPending
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
          <td className={`${styles.historicPosItemNumber}`}>{numbering}</td>
          <td className={styles.petColumn}>{hhmmssFromSeconds(posEntry.seconds)}</td>
          <td className={`${styles.crewColumn}`}>{posNameList?.join(", ")}</td>
          <td>{dist || "Not Set"}</td>
          <td>{duration || "Not Set"}</td>
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

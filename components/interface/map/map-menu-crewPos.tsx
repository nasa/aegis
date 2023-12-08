import {
  Dispatch,
  FunctionComponent,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import styles from "./map-menu-crewPos.module.css";
import {
  faBan,
  faCartShopping,
  faChevronDown,
  faChevronUp,
  faCrosshairs,
  faFloppyDisk,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "../form/globalFields";
import { updateMapDirective } from "store/map";
import { useAppDispatch } from "utils/useAppDispatch";
import { shallowEqual, deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import {
  thunkCancelCrewPos,
  thunkCancelCrewPosLocation,
  thunkCreateCrewPos,
  thunkSaveCrewPosition,
} from "store/thunk/thunkRex";
import { setCrewPosEditingUuid, setSelectedCrewPosUuid, upsertCrewPos } from "store/rex";
import { hhmmssFromSeconds } from "utils/formatting";
import { selectEVASequenceItem } from "store/cross-slice";
import { setHoverUuidsForCrewPos } from "store/hover";
import { CrewPosKabobMenu } from "./map-menu-crewPos-menu";
import { orderBy } from "lodash";
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { isModified } from "utils/component-helpers";

export const MapCrewPositionMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRexIsRunning = useAppSelector((state) => {
    const running = state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid)
      ?.rexRunning;
    return running === undefined ? false : running; //must return bool (undefined is not acceptable)
  }, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const allCrewPos = useAppSelector((state) => {
    const rexCrewPos = state.rex.rexes.find((r) => r.uuid === selectedRexUuid)?.crewPos;
    return orderBy(rexCrewPos, ["createdAt"], "desc");
  }, deepEqual);

  const crewPosEditingUuid = useAppSelector((state) => state.rex.crewPosEditingUuid, refEqual);
  const crewPosInEdit = allCrewPos.find((c) => c.uuid === crewPosEditingUuid);
  const editingCrewPos = useAppSelector(
    (state) =>
      state.rex.rexes
        .find((r) => r.uuid === selectedRexUuid)
        ?.crewPos?.find((c) => c.uuid === state.rex.crewPosEditingUuid),
    shallowEqual
  );
  const editingCrewPosFromDb = useAppSelector(
    (state) =>
      state.rex.rexesFromDb
        .find((r) => r.uuid === selectedRexUuid)
        ?.crewPos?.find((c) => c.uuid === state.rex.crewPosEditingUuid),
    deepEqual
  );

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === crewPosEditingUuid ? mapDirective : null;
  const thisMapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const [crew, setCrew] = useState<RexCrewType[]>(["EV1", "EV2", "Cart"]);
  const [showCrewPosList, setShowCrewPosList] = useState(false);
  const [modified, setModified] = useState(false); //track modified
  const [showMenu, setShowMenu] = useState(true);

  //for enable/disable save button
  useEffect(() => {
    if (!crewPosEditingUuid) return;
    setModified(isModified([editingCrewPos], [editingCrewPosFromDb]));
  }, [crewPosEditingUuid, editingCrewPos, editingCrewPosFromDb]);

  const toggleCrewAssigned = useCallback(
    (crewMember: RexCrewType) => {
      let newCrew: RexCrewType[] = [];
      //add or remove crew
      if (crew.includes(crewMember)) {
        newCrew = crew.filter((c) => c !== crewMember);
      } else {
        newCrew = [...crew, crewMember];
      }
      //sort so "Cart" is at the end
      newCrew.sort((a, b) => {
        if (a === "Cart") {
          return 1;
        }
        if (b === "Cart") {
          return -1;
        }
        return a < b ? -1 : 1;
      });
      //currently in the middle of placing a new crew pos, or editing existing. Update the crew in the store as well
      if (crewPosEditingUuid) {
        dispatch(
          upsertCrewPos({
            rexUuid: selectedRexUuid,
            crewPos: { ...crewPosInEdit, crew: newCrew },
          })
        );
        //cancel map action if all crew is toggled off
        if (thisMapAction && newCrew.length === 0) {
          dispatch(thunkCancelCrewPosLocation({ crewPosEditingUuid }));
        }
      }

      setCrew(newCrew);
    },
    [crew, dispatch, selectedRexUuid, thisMapAction, crewPosEditingUuid, crewPosInEdit]
  );

  const verifyNoActiveMapAction = (): boolean => {
    // if another mapAction is underway, fire an alert and return false
    if (mapDirective && mapDirective.mapAction !== null) {
      alert(
        "Another map action is underway. Please cancel or complete that map action before starting a new one."
      );
      return false;
    } else {
      return true;
    }
  };

  //create a new crew position
  const handleCreate = async () => {
    if (verifyNoActiveMapAction()) {
      const newUuid = (await dispatch(thunkCreateCrewPos({ crew: crew }))).payload;
      if (newUuid) {
        dispatch(
          updateMapDirective({
            mapItemType: "crewPos",
            uuid: newUuid,
            mapAction: "createMarker",
          })
        );
      }
    }
  };
  const handlePositionEdit = async (crewPosEditingUuid: string) => {
    if (verifyNoActiveMapAction()) {
      dispatch(
        updateMapDirective({
          mapItemType: "crewPos",
          uuid: crewPosEditingUuid,
          mapAction: "editMarker",
        })
      );
    }
  };
  return (
    <div className={styles.mapCrewPosDisplayContainer}>
      <div
        className={`${styles.mapCrewPosDisplay} ${showMenu ? styles.menuOpen : styles.menuClosed}`}
      >
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
            style={{ cursor: "pointer" }}
          >
            {editPerms && (
              <div className={styles.toggleContainer}>
                <div
                  className={`${styles.toggleLeft} ${styles.center} ${
                    crew.includes("EV1") && styles.toggleSelected
                  }`}
                  onClick={() => {
                    toggleCrewAssigned("EV1");
                  }}
                >
                  1
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    crew.includes("EV2") && styles.toggleSelected
                  }`}
                  onClick={() => {
                    toggleCrewAssigned("EV2");
                  }}
                >
                  2
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    crew.includes("Cart") && styles.toggleSelected
                  }`}
                  onClick={() => {
                    toggleCrewAssigned("Cart");
                  }}
                >
                  <FontAwesomeIcon
                    icon={faCartShopping}
                    size="sm"
                    style={{
                      marginTop: "3px",
                      width: "15px",
                      color: `${crew.includes("Cart") ? "var(--grey1)" : "var(--grey5)"}`,
                      outline: "none",
                    }}
                    tabIndex={0}
                  />
                </div>
                <div className={styles.setPosButton}>
                  {thisMapAction === null && (
                    <Button
                      onClick={async () => {
                        if (crewPosEditingUuid) {
                          await handlePositionEdit(crewPosEditingUuid);
                        } else {
                          await handleCreate();
                        }
                      }}
                      label={crewPosEditingUuid ? "Edit Pos." : "New Pos."}
                      icon={faCrosshairs}
                      style={{ height: "1.75em", width: "90px", marginLeft: 0 }}
                      enabled={crew.length > 0 && selectedRexIsRunning}
                    />
                  )}
                  {(thisMapAction === "createMarker" || thisMapAction === "editMarker") && (
                    <Button
                      onClick={() => {
                        dispatch(thunkCancelCrewPosLocation({ crewPosEditingUuid }));
                        if (thisMapAction === "createMarker") {
                          dispatch(setCrewPosEditingUuid(null));
                        }
                      }}
                      icon={faBan}
                      label="Cancel Pos."
                      style={{ height: "1.75em", width: "100px", marginLeft: 0 }}
                    />
                  )}
                </div>
                {crewPosInEdit?.location && (
                  <>
                    <div>
                      <Button
                        onClick={() => {
                          dispatch(thunkSaveCrewPosition({ crewPos: crewPosInEdit }));
                        }}
                        icon={faFloppyDisk}
                        toolTip={`Save Crew Position ${modified ? "" : " (nothing to save)"}`}
                        enabled={modified && crew.length > 0}
                        style={{
                          height: "1.75em",
                          backgroundColor:
                            modified && crew.length > 0 ? "var(--alert)" : "var(--alert-disabled)",
                          color: modified && crew.length > 0 ? "white" : "var(--grey4)",
                        }}
                      />
                    </div>
                    <div>
                      <Button
                        onClick={() => {
                          dispatch(thunkCancelCrewPos({ crewPosUuid: crewPosEditingUuid }));
                        }}
                        icon={faBan}
                        toolTip="Cancel Edit"
                        style={{ height: "1.75em" }}
                      />
                    </div>
                  </>
                )}
              </div>
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
          <div className={styles.crewPosTableContainer}>
            <table className={styles.crewPosTable}>
              <thead>
                <tr className={styles.historicPosHeader}>
                  <td>#</td>
                  <td className={styles.petColumn}>PET</td>
                  <td className={styles.crewColumn}>Crew</td>
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
                </tr>
              </thead>
              <tbody>
                {allCrewPos?.length > 0 && (
                  <CrewPositionItem
                    crewPos={allCrewPos[0]}
                    showKabob={editPerms}
                    numbering={allCrewPos.length}
                    setCrew={setCrew}
                  />
                )}
                <tr>
                  <td
                    className={styles.historicPosTitle}
                    onClick={() => {
                      setShowCrewPosList(!showCrewPosList);
                    }}
                    colSpan={5}
                  >
                    Past Positions
                    <FontAwesomeIcon
                      icon={showCrewPosList ? faChevronDown : faChevronUp}
                      size="sm"
                      style={{ paddingLeft: "5px" }}
                    />
                  </td>
                </tr>
                {showCrewPosList && allCrewPos && (
                  <>
                    {/* <div className={styles.historicPosContainer}> */}
                    {allCrewPos.flatMap((crewPos, index, crewPosArray) => {
                      if (index === 0) return []; //skip the first (most recent) entry

                      return (
                        <CrewPositionItem
                          key={crewPos.uuid}
                          crewPos={crewPos}
                          showKabob={editPerms}
                          numbering={crewPosArray.length - index}
                          setCrew={setCrew}
                        />
                      );
                    })}
                    {/* </div> */}
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

export const CrewPositionItem: FunctionComponent<{
  crewPos: CrewPos;
  showKabob: boolean;
  numbering: number;
  setCrew: Dispatch<SetStateAction<RexCrewType[]>>;
}> = ({ crewPos, showKabob, numbering, setCrew }) => {
  const dispatch = useAppDispatch();

  const landerLocation = useAppSelector((state) => state.mission.mission.landerLocation, refEqual);
  const traverseRate = useAppSelector((state) => {
    const eva = state.eva.evas.find((e) => e.uuid === state.eva.selectedEvaUuid);
    if (eva?.traverseRate) {
      return eva.traverseRate;
    } else {
      return state.mission.mission.traverseRate;
    }
  }, refEqual);
  const radius = useAppSelector((state) => state.mission.mission.planetRadius, refEqual);
  const crewPosEditingUuid = useAppSelector((state) => state.rex.crewPosEditingUuid, refEqual);

  const isSelected = useAppSelector(
    (state) => state.rex.selectedCrewPosUuid === crewPos.uuid,
    refEqual
  );
  const isHovered = useAppSelector(
    (state) => state.hover.crewPosItemUuid === crewPos.uuid,
    refEqual
  );
  const isEditing = useAppSelector(
    (state) => state.rex.crewPosEditingUuid === crewPos.uuid,
    refEqual
  );

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
  }, [crewPos.uuid, isHovered, isSelected]);

  //calculate distance and duration for this crew position location
  useEffect(() => {
    if (crewPos.location && landerLocation && radius && traverseRate) {
      const newDistance = +getDistanceBetweenTwoCoordinates(
        crewPos.location,
        landerLocation,
        radius
      ).toFixed(2);
      setDist(newDistance);
      setDuration(calcPathDurationMins([newDistance], traverseRate).toFixed(2));
    } else {
      setDist(null);
      setDuration(null);
    }
  }, [crewPos.location, landerLocation, radius, traverseRate]);

  return (
    <>
      {crewPos && (
        <tr
          key={crewPos.uuid}
          className={`${styles.historicPosItem} ${
            !crewPos.location && styles.historicPosItemPending
          } ${itemStyle}`}
          onMouseEnter={() => {
            dispatch(setHoverUuidsForCrewPos(crewPos.uuid));
          }}
          onMouseLeave={() => {
            dispatch(setHoverUuidsForCrewPos(null));
          }}
          onClick={async () => {
            //cancel out anything currently in edit
            await dispatch(thunkCancelCrewPos({ crewPosUuid: crewPosEditingUuid }));

            if (isSelected) {
              dispatch(setSelectedCrewPosUuid(null));
            } else {
              dispatch(setSelectedCrewPosUuid(crewPos.uuid));
              dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
            }
          }}
        >
          <td className={`${styles.historicPosItemNumber}`}>{numbering}</td>
          <td className={styles.petColumn}>{hhmmssFromSeconds(crewPos.seconds)}</td>
          <td className={`${styles.crewColumn}`}>{crewPos.crew.join(", ")}</td>
          <td>{dist || "Not Set"}</td>
          <td>{duration || "Not Set"}</td>
          <td
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {showKabob && (
              <CrewPosKabobMenu
                crewPos={crewPos}
                isSelected={isSelected}
                isEditing={isEditing}
                setCrewSelected={setCrew}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
};

import { Dropdown, ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useCallback } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import {
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
  setEvaSequence,
  setSelectedEvaSequenceItemUuid,
} from "store/eva";
import { deleteTraverse, setSelectedTraverseRightNavItem, upsertTraverses } from "store/traverse";
import evaStyles from "./eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { setSelectedStationUuid } from "store/station";
import { decodeEmoji } from "utils/formatting";
import { getTotalDistance } from "utils/geoMath";
import { setRightPanelOpen } from "store/interface";
import { setHoverItemUuid } from "store/playheadHover";

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
  evaSequence: EvaSequenceItem[];
  editMode: boolean;
}> = ({ evaUuid, evaSequence, editMode }) => {
  const dispatch = useDispatch();

  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, shallowEqual);
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const hoverItemUuid = useAppSelector((state) => state.playheadHover.itemUuid, refEqual);

  const setTraverseNamesAndStartEnds = useCallback(
    (evaSequence: EvaSequenceItem[]) => {
      const newTraverses: Traverse[] = [];
      evaSequence.forEach((item, index) => {
        if (item.type === "traverse") {
          const thisTraverse = traverses.find((traverse) => traverse.uuid === item.uuid);
          const newTraversePath = [...thisTraverse.path];
          if (thisTraverse) {
            if (newTraversePath.length === 0) {
              // make blank location array with two points if it is empty
              newTraversePath.push({ lat: null, lng: null } as AEGISPoint);
              newTraversePath.push({ lat: null, lng: null } as AEGISPoint);
            }

            // if item is a traverse, there is always a previous station
            const previousItem = evaSequence[index - 1];
            const previousStation = stations.find((station) => station.uuid === previousItem.uuid);
            if (previousStation) {
              // replace first point with previous station location
              newTraversePath[0] = {
                lat: previousStation.location?.lat,
                lng: previousStation.location?.lng,
              } as AEGISPoint;
            }
            const nextItem = evaSequence[index + 1];
            const nextStation = stations.find((station) => station.uuid === nextItem.uuid);
            if (nextStation) {
              // replace last point with next station location
              newTraversePath[newTraversePath.length - 1] = {
                lat: nextStation.location?.lat,
                lng: nextStation.location?.lng,
              } as AEGISPoint;
            }

            // recalculate traverse path distances
            const distances: number[] = [];

            for (let i = 1; i < newTraversePath.length; i++) {
              distances.push(
                getTotalDistance(
                  [newTraversePath[i - 1], newTraversePath[i]],
                  parseFloat(mission.config.msv.radius.minor)
                )
              );
            }

            // rename the traverse to <previous station name> to <next station name>
            const newTraverseName = previousStation?.name + " to " + nextStation?.name;

            const newTraverse: Traverse = {
              ...thisTraverse,
              name: newTraverseName,
              path: newTraversePath,
              pathSegmentDistances: distances,
            };
            newTraverses.push(newTraverse);
          }
        }
      });
      dispatch(upsertTraverses(newTraverses));
    },
    [traverses, stations, dispatch, mission]
  );

  const handleSequenceStationChange = (stationUuid: string, index: number) => {
    const newEvaSequence = [...evaSequence];
    newEvaSequence[index] = {
      type: "station",
      uuid: stationUuid,
    };
    setTraverseNamesAndStartEnds(newEvaSequence);

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
  };

  const handleSequenceStationDelete = (index: number) => {
    const newEvaSequence = [...evaSequence];
    // if there is a traverse after the station, delete it, if not delete the traverse before the station if there is one
    if (newEvaSequence[index + 1] && newEvaSequence[index + 1].type === "traverse") {
      dispatch(deleteTraverse({ uuid: newEvaSequence[index + 1].uuid }));
      // remove the station and this sequence from the newEvaSequence
      newEvaSequence.splice(index, 2);
    } else if (newEvaSequence[index - 1] && newEvaSequence[index - 1].type === "traverse") {
      // if there is a traverse before the station, delete it
      dispatch(deleteTraverse({ uuid: newEvaSequence[index - 1].uuid }));
      // remove the station and this sequence from the newEvaSequence
      newEvaSequence.splice(index - 1, 2);
    } else {
      // remove the station alone
      newEvaSequence.splice(index, 1);
    }

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    setTraverseNamesAndStartEnds(newEvaSequence);
  };

  const handeleMoveStationUp = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index -2 with the item at index
    const stationBeforeIndex = index - 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    setTraverseNamesAndStartEnds(newEvaSequence);
  };

  const handeleMoveStationDown = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index +2 with the item at index
    const stationBeforeIndex = index + 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;
    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    setTraverseNamesAndStartEnds(newEvaSequence);
  };

  return (
    <div className={evaStyles.evaSequence}>
      {evaSequence &&
        evaSequence.map((sequenceItem, index) => {
          let evaItemIcon = null;
          if (sequenceItem.type === "station") {
            const thisStation = stations.find((station) => station.uuid === sequenceItem.uuid);
            if (thisStation) {
              evaItemIcon = (
                <div className={evaStyles.iconCustom}>{decodeEmoji(thisStation.icon)}</div>
              );
            } else {
              evaItemIcon = <div className={evaStyles.iconCustom}></div>;
            }
          } else if (sequenceItem.type === "traverse") {
            evaItemIcon = (
              <div className={evaStyles.evaTraverseIndicator}>
                <div className={evaStyles.iconTraverseDotsContainer}>
                  <div className={evaStyles.iconTraverse} />
                </div>
              </div>
            );
          }

          let isEvaSequenceItemSelectedOrHoveredStyle = null;
          if (sequenceItem.uuid === selectedEvaSequenceItemUuid) {
            isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameSelected;
          } else if (sequenceItem.uuid === hoverItemUuid) {
            isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameHoverMode;
          }

          return (
            <div
              className={evaStyles.evaItem}
              key={`${index}${evaUuid}${sequenceItem.uuid}`}
              onClick={() => {
                if (editMode) return;

                if (selectedEvaSequenceItemUuid === sequenceItem.uuid) {
                  dispatch(setSelectedEvaSequenceItemUuid(null));
                  dispatch(setSelectedEvaRightNavItem("info_panel"));
                } else {
                  dispatch(setSelectedEvaSequenceItemUuid(sequenceItem.uuid));
                  dispatch(setSelectedEvaUuid(evaUuid));
                  if (sequenceItem.type === "station") {
                    dispatch(setSelectedStationUuid(sequenceItem.uuid));
                  } else if (sequenceItem.type === "traverse") {
                    dispatch(setSelectedTraverseRightNavItem("info_panel"));
                    dispatch(setSelectedStationUuid(null));
                  }
                  dispatch(setRightPanelOpen(true));
                }
              }}
              onMouseOver={() => {
                dispatch(setHoverItemUuid(sequenceItem.uuid));
              }}
              onMouseLeave={() => {
                dispatch(setHoverItemUuid(null));
              }}
            >
              {evaItemIcon}

              {sequenceItem.type === "station" && (
                <>
                  {!editMode ? (
                    <div
                      className={`${evaStyles.evaItemName} ${isEvaSequenceItemSelectedOrHoveredStyle}`}
                    >
                      <div className={evaStyles.evaItemNameText}>
                        {stations.find((station) => station.uuid === sequenceItem.uuid)?.name
                          ? stations.find((station) => station.uuid === sequenceItem.uuid)?.name
                          : `< Station not selected >`}
                      </div>
                      <ModifiedIndicator
                        obj1={[stations.find((station) => station.uuid === sequenceItem.uuid)]}
                        obj2={[
                          stationsFromDb.find((station) => station.uuid === sequenceItem.uuid),
                        ]}
                        svgStyle={{
                          width: "15",
                          height: "12",
                          cx: "5",
                          cy: "9",
                          r: "3",
                          fill: "#ff0000",
                        }}
                      />
                      <div className={evaStyles.evaItemNameRightSpacer}></div>
                    </div>
                  ) : (
                    <div
                      className={`${evaStyles.evaItemName} ${evaStyles.editMode} ${isEvaSequenceItemSelectedOrHoveredStyle}`}
                    >
                      <Dropdown
                        selected={sequenceItem.uuid}
                        arrowStyle={{ top: "1px" }}
                        containerStyle={{ width: "200px" }}
                        onChange={(val) => {
                          handleSequenceStationChange(val, index);
                        }}
                      >
                        <option value="">-- Select a station --</option>
                        {stations.map((station) => {
                          const stationAlreadyInSequence = evaSequence.find(
                            (sequenceItem) => sequenceItem.uuid === station.uuid
                          );
                          if (
                            (stationAlreadyInSequence && station.uuid !== sequenceItem.uuid) ||
                            !station.location
                          )
                            return null;
                          return (
                            <option key={station.uuid} value={station.uuid}>
                              {station.name}
                            </option>
                          );
                        })}
                      </Dropdown>
                      <div className={evaStyles.evaItemNameButtons}>
                        <div
                          className={`${evaStyles.evaItemNameButton} ${
                            index === 0 && evaStyles.disabled
                          }`}
                          onClick={() => {
                            if (index === 0) return;
                            handeleMoveStationUp(index);
                          }}
                        >
                          <FontAwesomeIcon icon={faArrowUp} />
                        </div>
                        <div
                          className={`${evaStyles.evaItemNameButton} ${
                            index === evaSequence.length - 1 && evaStyles.disabled
                          }`}
                          onClick={() => {
                            if (index === evaSequence.length - 1) return;
                            handeleMoveStationDown(index);
                          }}
                        >
                          <FontAwesomeIcon icon={faArrowDown} />
                        </div>
                        <div
                          className={evaStyles.evaItemNameButton}
                          onClick={() => {
                            handleSequenceStationDelete(index);
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {sequenceItem.type === "traverse" && (
                <>
                  <div
                    className={`${evaStyles.evaItemName} ${
                      editMode && evaStyles.editMode
                    }  ${isEvaSequenceItemSelectedOrHoveredStyle}`}
                  >
                    <div className={evaStyles.evaItemNameText}>
                      {traverses.find((traverse) => traverse.uuid === sequenceItem.uuid)?.name}
                    </div>
                    <ModifiedIndicator
                      obj1={[traverses.find((traverse) => traverse.uuid === sequenceItem.uuid)]}
                      obj2={[
                        traversesFromDb.find((traverse) => traverse.uuid === sequenceItem.uuid),
                      ]}
                      svgStyle={{
                        width: "15",
                        height: "12",
                        cx: "5",
                        cy: "9",
                        r: "3",
                        fill: "#ff0000",
                      }}
                    />
                    <div className={evaStyles.evaItemNameRightSpacer}></div>
                  </div>
                </>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default EvaItemSequence;

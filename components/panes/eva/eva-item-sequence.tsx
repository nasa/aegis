import { Dropdown } from "components/interface/_global-elements";
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

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
  evaSequence: EvaSequenceItem[];
  editMode: boolean;
}> = ({ evaUuid, evaSequence, editMode }) => {
  const dispatch = useDispatch();

  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const setTraversesStartEndToStations = useCallback(
    (evaSequence: EvaSequenceItem[]) => {
      const newTraverses = [];
      evaSequence.forEach((item, index) => {
        if (item.type === "traverse") {
          const thisTraverse = traverses.find((traverse) => traverse.uuid === item.uuid);
          const newTraverseLocation = [...thisTraverse.location];
          if (thisTraverse) {
            if (newTraverseLocation.length === 0) {
              // make blank location array with two points if it is empty
              newTraverseLocation.push({ lat: null, lng: null } as AEGISPoint);
              newTraverseLocation.push({ lat: null, lng: null } as AEGISPoint);
            }

            // if item is a traverse, there is always a previous station
            const previousItem = evaSequence[index - 1];
            const previousStation = stations.find((station) => station.uuid === previousItem.uuid);
            if (previousStation) {
              // replace first point with previous station location
              newTraverseLocation[0] = {
                lat: previousStation.location?.lat,
                lng: previousStation.location?.lng,
              } as AEGISPoint;
            }
            const nextItem = evaSequence[index + 1];
            const nextStation = stations.find((station) => station.uuid === nextItem.uuid);
            if (nextStation) {
              // replace last point with next station location
              newTraverseLocation[newTraverseLocation.length - 1] = {
                lat: nextStation.location?.lat,
                lng: nextStation.location?.lng,
              } as AEGISPoint;
            }
            const newTraverse = {
              ...thisTraverse,
              location: newTraverseLocation,
            };
            newTraverses.push(newTraverse);
          }
        }
      });
      dispatch(upsertTraverses(newTraverses));
    },
    [traverses, stations, dispatch]
  );

  const handleSequenceStationChange = (stationUuid: string, index: number) => {
    const newEvaSequence = [...evaSequence];
    newEvaSequence[index] = {
      type: "station",
      uuid: stationUuid,
    };
    setTraversesStartEndToStations(newEvaSequence);

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
  };

  const handleSequenceStationDelete = (index: number) => {
    const newEvaSequence = [...evaSequence];
    // if there is a traverse after the station, delete it, if not delete the traverse before the station if there is one
    if (newEvaSequence[index + 1] && newEvaSequence[index + 1].type === "traverse") {
      dispatch(deleteTraverse({ traverseUuid: newEvaSequence[index + 1].uuid }));
      // remove the station and this sequence from the newEvaSequence
      newEvaSequence.splice(index, 2);
    } else if (newEvaSequence[index - 1] && newEvaSequence[index - 1].type === "traverse") {
      // if there is a traverse before the station, delete it
      dispatch(deleteTraverse({ traverseUuid: newEvaSequence[index - 1].uuid }));
      // remove the station and this sequence from the newEvaSequence
      newEvaSequence.splice(index - 1, 2);
    } else {
      // remove the station alone
      newEvaSequence.splice(index, 1);
    }

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    setTraversesStartEndToStations(newEvaSequence);
  };

  const handeleMoveStationUp = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index -2 with the item at index
    const stationBeforeIndex = index - 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    setTraversesStartEndToStations(newEvaSequence);
  };

  const handeleMoveStationDown = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index +2 with the item at index
    const stationBeforeIndex = index + 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;
    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    setTraversesStartEndToStations(newEvaSequence);
  };

  return (
    <div className={evaStyles.evaSequence}>
      {evaSequence &&
        evaSequence.map((sequenceItem, index) => {
          let evaItemIcon = null;
          if (sequenceItem.type === "station") {
            if (index === 0 || index === evaSequence.length - 1) {
              // draw first and last station as lander
              evaItemIcon = (
                <div className={evaStyles.evaIndicator}>
                  <div className={evaStyles.iconLander} />
                </div>
              );
            } else {
              evaItemIcon = (
                <div className={evaStyles.evaIndicator}>
                  <div className={evaStyles.iconStation} />
                </div>
              );
            }
          } else if (sequenceItem.type === "traverse") {
            evaItemIcon = (
              <div className={evaStyles.evaIndicator}>
                <div className={evaStyles.iconTraverseContainer}>
                  <div className={evaStyles.iconTraverse} />
                </div>
              </div>
            );
          }

          const isEvaSequenceItemSelectedStyle =
            sequenceItem.uuid === selectedEvaSequenceItemUuid
              ? evaStyles.evaItemNameSelected
              : null;

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
                  }
                }
              }}
            >
              {evaItemIcon}

              {sequenceItem.type === "station" && (
                <>
                  {!editMode ? (
                    <div className={`${evaStyles.evaItemName} ${isEvaSequenceItemSelectedStyle}`}>
                      {stations.find((station) => station.uuid === sequenceItem.uuid)?.name
                        ? stations.find((station) => station.uuid === sequenceItem.uuid)?.name
                        : `< Station not selected >`}
                    </div>
                  ) : (
                    <div
                      className={`${evaStyles.evaItemName} ${evaStyles.editMode} ${isEvaSequenceItemSelectedStyle}`}
                    >
                      <Dropdown
                        selected={sequenceItem.uuid}
                        arrowStyle={{ top: "1px" }}
                        containerStyle={{ width: "200px" }}
                        onChange={(val) => {
                          handleSequenceStationChange(val, index);
                        }}
                      >
                        <option value="unassigned">-- Select a station --</option>
                        {stations.map((station) => {
                          const stationAlreadyInSequence = evaSequence.find(
                            (sequenceItem) => sequenceItem.uuid === station.uuid
                          );
                          if (stationAlreadyInSequence && station.uuid !== sequenceItem.uuid)
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
                <div
                  className={`${evaStyles.evaItemName} ${
                    editMode && evaStyles.editMode
                  }  ${isEvaSequenceItemSelectedStyle}`}
                >
                  {traverses.find((traverse) => traverse.uuid === sequenceItem.uuid)?.name}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default EvaItemSequence;

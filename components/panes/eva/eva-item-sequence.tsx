import { Dropdown, ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import {
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
  setEvaSequence,
  setSelectedEvaSequenceItemUuid,
} from "store/eva";
import { deleteTraverse, setSelectedTraverseRightNavItem } from "store/traverse";
import evaStyles from "./eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { setSelectedStationUuid } from "store/station";
import { decodeEmoji } from "utils/formatting";
import { setRightPanelOpen } from "store/interface";
import {
  setLeftPanelHoverUuid,
  setMapItemHoverUuid,
  setTimelineHoverUuid,
} from "store/playheadHover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkUpdateAllTraversesForEVASequence } from "store/thunk/thunkTraverse";

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
  evaSequence: EvaSequenceItem[];
  editMode: boolean;
}> = ({ evaUuid, evaSequence, editMode }) => {
  const dispatch = useDispatch();
  const appDispatch = useAppDispatch();

  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, shallowEqual);

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const hoverItemUuid = useAppSelector((state) => state.playheadHover.leftPanelItemUuid, refEqual);

  const handleSequenceStationChange = (stationUuid: string, index: number) => {
    const newEvaSequence = [...evaSequence];
    newEvaSequence[index] = {
      type: "station",
      uuid: stationUuid,
    };

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    //setTraverseNamesAndStartEnds(newEvaSequence);
    appDispatch(thunkUpdateAllTraversesForEVASequence({ evaSequence: newEvaSequence }));
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
    appDispatch(thunkUpdateAllTraversesForEVASequence({ evaSequence: newEvaSequence }));
  };

  const handeleMoveStationUp = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index -2 with the item at index
    const stationBeforeIndex = index - 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    appDispatch(thunkUpdateAllTraversesForEVASequence({ evaSequence: newEvaSequence }));
  };

  const handeleMoveStationDown = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index +2 with the item at index
    const stationBeforeIndex = index + 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;
    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    appDispatch(thunkUpdateAllTraversesForEVASequence({ evaSequence: newEvaSequence }));
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
              evaItemIcon = <div className={evaStyles.iconCustom} />;
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
                dispatch(setMapItemHoverUuid(sequenceItem.uuid));
                dispatch(setTimelineHoverUuid(sequenceItem.uuid));
                dispatch(setLeftPanelHoverUuid(sequenceItem.uuid));
              }}
              onMouseLeave={() => {
                dispatch(setMapItemHoverUuid(null));
                dispatch(setTimelineHoverUuid(null));
                dispatch(setLeftPanelHoverUuid(null));
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
                      <div className={evaStyles.evaItemNameRightSpacer} />
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
                    <div className={evaStyles.evaItemNameRightSpacer} />
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

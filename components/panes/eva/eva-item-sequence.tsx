import { ModifiedIndicator } from "components/interface/_global-elements";
import { Dropdown } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid, setEvaSequence } from "store/eva";
import evaStyles from "./eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { decodeEmoji, hhmmFromMinutes } from "utils/formatting";
import { setRightPanelOpen } from "store/interface";
import { setAllHoverUuids } from "store/playheadHover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkUpdateAllTraversesForEVA } from "store/thunk/thunkTraverse";
import { selectEVASequenceItem } from "store/cross-slice";
import { thunkChangeStationInEva, thunkDeleteStationFromEva } from "store/thunk/thunkEva";

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
  evaSequence: EvaSequenceItem[];
  editMode: boolean;
}> = ({ evaUuid, evaSequence, editMode }) => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();

  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const stationCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    shallowEqual
  );
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, shallowEqual);
  const traverseCalculatedFields = useAppSelector(
    (state) => state.traverse.calculatedFields,
    shallowEqual
  );

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const hoverItemUuid = useAppSelector((state) => state.playheadHover.leftPanelItemUuid, refEqual);

  const handleMoveStationUp = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index -2 with the item at index
    const stationBeforeIndex = index - 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;

    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    thunkDispatch(thunkUpdateAllTraversesForEVA({ evaSequence: newEvaSequence }));
  };

  const handleMoveStationDown = (index: number) => {
    const newEvaSequence = [...evaSequence];

    // swap the item at index +2 with the item at index
    const stationBeforeIndex = index + 2;
    const tempStation = newEvaSequence[stationBeforeIndex];
    newEvaSequence[stationBeforeIndex] = newEvaSequence[index];
    newEvaSequence[index] = tempStation;
    dispatch(setEvaSequence({ evaUuid, sequence: newEvaSequence }));
    thunkDispatch(thunkUpdateAllTraversesForEVA({ evaSequence: newEvaSequence }));
  };

  return (
    <div className={evaStyles.evaSequence}>
      {evaSequence &&
        evaSequence.map((sequenceItem, index) => {
          let evaItemIcon = null;
          let thisStation: Station = null;
          let thisTraverse: Traverse = null;
          if (sequenceItem.type === "station") {
            thisStation = stations.find((station) => station.uuid === sequenceItem.uuid);
            if (thisStation) {
              evaItemIcon = (
                <div className={evaStyles.iconCustom}>{decodeEmoji(thisStation.icon)}</div>
              );
            } else {
              evaItemIcon = <div className={evaStyles.iconCustom} />;
            }
          } else if (sequenceItem.type === "traverse") {
            thisTraverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
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
                  dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
                  dispatch(setSelectedEvaRightNavItem("info_panel"));
                } else {
                  dispatch(setSelectedEvaUuid(evaUuid));
                  dispatch(selectEVASequenceItem({ sequenceItemUuid: sequenceItem.uuid }));
                  dispatch(setRightPanelOpen(true));
                }
              }}
              onMouseEnter={() => {
                dispatch(setAllHoverUuids(sequenceItem.uuid));
              }}
              onMouseLeave={() => {
                dispatch(setAllHoverUuids(null));
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
                        {thisStation?.name ? thisStation?.name : `< Station not selected >`}
                      </div>
                      <ModifiedIndicator
                        obj1={[thisStation]}
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
                      <div className={evaStyles.evaItemDuration}>
                        {hhmmFromMinutes(
                          stationCalculatedFields.find(
                            (stationData) => stationData.uuid === thisStation.uuid
                          )?.totalTime.durationUpper
                        )}
                      </div>
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
                          thunkDispatch(
                            thunkChangeStationInEva({
                              evaSequence,
                              sequenceIndex: index,
                              newStationUuid: val,
                              evaUuid,
                            })
                          );
                        }}
                        toolTip="Station"
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
                            handleMoveStationUp(index);
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
                            handleMoveStationDown(index);
                          }}
                        >
                          <FontAwesomeIcon icon={faArrowDown} />
                        </div>
                        <div
                          className={evaStyles.evaItemNameButton}
                          onClick={() => {
                            thunkDispatch(
                              thunkDeleteStationFromEva({
                                evaSequence,
                                sequenceIndex: index,
                                evaUuid,
                              })
                            );
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
                    <div className={evaStyles.evaItemNameText}>{thisTraverse?.name}</div>
                    <ModifiedIndicator
                      obj1={[thisTraverse]}
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
                    <div className={evaStyles.evaItemDuration}>
                      {hhmmFromMinutes(
                        traverseCalculatedFields.find(
                          (traverseData) => traverseData.uuid === thisTraverse?.uuid
                        )?.durationMinutes
                      )}
                    </div>
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

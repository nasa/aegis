import { ModifiedIndicator } from "components/interface/_global-elements";
import { Dropdown } from "components/interface/form/globalFields";
import { FunctionComponent, useState } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  decodeEmoji,
  secondsFromhhmmss,
  hhmmssFromSeconds,
  hmmFromMinutes,
} from "utils/formatting";
import { setRightPanelOpen } from "store/interface";
import { setHoverUuidsForSequence } from "store/hover";
import { useAppDispatch } from "utils/useAppDispatch";
import { selectEVASequenceItem } from "store/cross-slice";
import {
  thunkChangeStationInEva,
  thunkDeleteStationFromEva,
  thunkReorderStationInEva,
} from "store/thunk/thunkEva";
import { thunkCycleStationRexToNextStatus } from "store/thunk/thunkStation";
import { thunkCycleTraverseRexToNextStatus } from "store/thunk/thunkTraverse";
import { getRexStatusDisplayProperties } from "../../../utils/rex";
import _ from "lodash";
import PetInterval from "components/interface/page/petInterval";

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
  evaSequence: EvaSequenceItem[];
  editMode: boolean;
}> = ({ evaUuid, evaSequence, editMode }) => {
  const dispatch = useAppDispatch();

  const stations = useAppSelector(
    (state) => _.sortBy(state.station.stations, ["name"]),
    shallowEqual
  );
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
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelItemUuid, refEqual);

  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.rexRunning),
    shallowEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const sequenceItemsMetadata = useAppSelector(
    (state) =>
      state.eva.calculatedFields.find((c) => c.uuid === evaUuid)?.sequenceItemsCalculatedData,
    shallowEqual
  );

  const handleMoveStationUp = (index: number) => {
    dispatch(
      thunkReorderStationInEva({
        direction: "up",
        evaSequence: evaSequence,
        stationIndex: index,
        evaUuid: evaUuid,
      })
    );
  };

  const handleMoveStationDown = (index: number) => {
    dispatch(
      thunkReorderStationInEva({
        direction: "down",
        evaSequence: evaSequence,
        stationIndex: index,
        evaUuid: evaUuid,
      })
    );
  };

  const displayTraverseDuration = (thisTraverse: Traverse) => {
    const durationMinutes =
      traverseCalculatedFields.find((traverseData) => traverseData.uuid === thisTraverse?.uuid)
        ?.durationMinutes || null;
    return !isNaN(durationMinutes) ? hmmFromMinutes(durationMinutes) : "N/A";
  };

  const displayStationDwellTime = (thisStation: Station) => {
    const durationMinutes =
      stationCalculatedFields.find((stationData) => stationData.uuid === thisStation?.uuid)
        ?.totalDwellTime.durationUpper || null;
    return !isNaN(durationMinutes) ? hmmFromMinutes(durationMinutes) : "N/A";
  };

  const displayInProgressItemTimeRemaining = (rexPetSeconds: number, sequenceItemUuid: string) => {
    const sequenceItemMetadata = sequenceItemsMetadata.find(
      (sequenceItem) => sequenceItem.uuid === sequenceItemUuid
    );
    if (!sequenceItemMetadata) return "N/A";
    const secondsRemaining = (sequenceItemMetadata.endSeconds - rexPetSeconds) * -1;
    return hhmmssFromSeconds(secondsRemaining);
  };

  const getTraverseDisplay = (name: string) => {
    if (!name) {
      return "No traverse name";
    }
    const traverseNameParts: string[] = name.split(" to ", 2);
    let beforeTraverseName: string = traverseNameParts[0];
    let afterTraverseName: string = traverseNameParts[1];
    if (beforeTraverseName.length + afterTraverseName.length >= 30) {
      if (beforeTraverseName.length < 15) {
        afterTraverseName =
          afterTraverseName.substring(0, 12 + (15 - beforeTraverseName.length)) + "...";
      } else if (afterTraverseName.length < 15) {
        beforeTraverseName =
          traverseNameParts[0].substring(0, 12 + (15 - afterTraverseName.length)) + "...";
      } else {
        beforeTraverseName = beforeTraverseName.substring(0, 11) + "...";
        afterTraverseName = afterTraverseName.substring(0, 11) + "...";
      }
    }
    return `${beforeTraverseName} to ${afterTraverseName}`;
  };

  const handleSequenceItemClick = (sequenceItemUuid: string) => {
    if (selectedEvaSequenceItemUuid === sequenceItemUuid) {
      dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
      dispatch(setSelectedEvaRightNavItem("info_panel"));
    } else {
      dispatch(setSelectedEvaUuid(evaUuid));
      dispatch(selectEVASequenceItem({ sequenceItemUuid }));
      dispatch(setRightPanelOpen(true));
    }
  };

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <div className={evaStyles.evaSequence}>
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
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

          // add rex status styles
          if (runningRexFromDb && runningRexFromDb.selectedRexEvaUuid === evaUuid) {
            if (
              (thisStation && thisStation.rexStatus === "in-progress") ||
              (thisTraverse && thisTraverse.rexStatus === "in-progress")
            ) {
              isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexInProgress;
              if (sequenceItem.uuid === selectedEvaSequenceItemUuid) {
                isEvaSequenceItemSelectedOrHoveredStyle =
                  evaStyles.evaItemNameRexInProgressSelected;
              }
            } else if (
              (thisStation && thisStation.rexStatus === "complete") ||
              (thisTraverse && thisTraverse.rexStatus === "complete")
            ) {
              isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexComplete;
              if (sequenceItem.uuid === selectedEvaSequenceItemUuid) {
                isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameSelected;
              }
            } else if (
              (thisStation && thisStation.rexStatus === "skipped") ||
              (thisTraverse && thisTraverse.rexStatus === "skipped")
            ) {
              isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexSkipped;
              if (sequenceItem.uuid === selectedEvaSequenceItemUuid) {
                isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexSkippedSelected;
              }
            }
          }

          const sequenceItemRexStatus =
            sequenceItem.type === "station" ? thisStation?.rexStatus : thisTraverse?.rexStatus;

          return (
            <div
              className={evaStyles.evaItem}
              key={`${index}${evaUuid}${sequenceItem.uuid}`}
              onMouseEnter={() => {
                dispatch(setHoverUuidsForSequence(sequenceItem.uuid));
              }}
              onMouseLeave={() => {
                dispatch(setHoverUuidsForSequence(null));
              }}
            >
              {evaItemIcon}

              {runningRexFromDb && runningRexFromDb.selectedRexEvaUuid === evaUuid && editPerms && (
                <div
                  className={evaStyles.rexStatusWrapper}
                  onClick={() => {
                    if (sequenceItem.type === "station") {
                      dispatch(
                        thunkCycleStationRexToNextStatus({ stationUuid: sequenceItem.uuid })
                      );
                    } else if (sequenceItem.type === "traverse") {
                      dispatch(
                        thunkCycleTraverseRexToNextStatus({ traverseUuid: sequenceItem.uuid })
                      );
                    }
                  }}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={getRexStatusDisplayProperties(sequenceItemRexStatus).tooltip}
                >
                  <FontAwesomeIcon
                    icon={getRexStatusDisplayProperties(sequenceItemRexStatus).icon}
                    className={`${evaStyles.rexStatusIcon} ${
                      getRexStatusDisplayProperties(sequenceItemRexStatus).iconStyle
                    }`}
                  />
                </div>
              )}
              {sequenceItem.type === "station" && (
                <>
                  {!editMode ? (
                    <div
                      className={`${
                        evaStyles.evaItemName
                      } ${isEvaSequenceItemSelectedOrHoveredStyle} ${
                        getRexStatusDisplayProperties(sequenceItemRexStatus).customTextClassName
                      }`}
                      onClick={() => {
                        if (editMode) return;

                        handleSequenceItemClick(sequenceItem.uuid);
                      }}
                    >
                      <div className={evaStyles.evaItemLeft}>
                        <div className={evaStyles.evaItemNameText}>
                          {thisStation?.name ? thisStation?.name : `< Station not selected >`}
                        </div>
                        <ModifiedIndicator
                          obj1={[thisStation]}
                          obj2={[
                            stationsFromDb.find((station) => station.uuid === sequenceItem.uuid),
                          ]}
                        />
                      </div>
                      <div className={evaStyles.evaItemRight}>
                        <div
                          className={evaStyles.evaItemRightItem}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-html={"Total dwell time (h:mm)"}
                          data-tooltip-place="right"
                        >
                          {displayStationDwellTime(thisStation)}
                        </div>

                        {runningRexFromDb &&
                          runningRexFromDb.selectedRexEvaUuid === evaUuid &&
                          stations.find((station) => station.uuid === sequenceItem.uuid)
                            ?.rexStatus === "in-progress" && (
                            <div
                              className={evaStyles.evaItemRightItem}
                              data-tooltip-id="aegis-tooltip"
                              data-tooltip-html={"Time remaining (hh:mm:ss)"}
                              data-tooltip-place="right"
                            >
                              {displayInProgressItemTimeRemaining(
                                secondsFromhhmmss(rexPetTime),
                                sequenceItem.uuid
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`${evaStyles.evaItemName} ${evaStyles.editMode} ${isEvaSequenceItemSelectedOrHoveredStyle}`}
                    >
                      <div className={evaStyles.evaItemLeft}>
                        <Dropdown
                          selected={sequenceItem.uuid}
                          arrowStyle={{ top: "1px" }}
                          containerStyle={{ width: "190px" }}
                          selectStyle={{ width: "100%" }}
                          onChange={(val) => {
                            dispatch(
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
                      </div>
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
                            dispatch(
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
                    }  ${isEvaSequenceItemSelectedOrHoveredStyle} ${
                      getRexStatusDisplayProperties(sequenceItemRexStatus).customTextClassName
                    }`}
                    onClick={() => {
                      if (editMode) return;

                      handleSequenceItemClick(sequenceItem.uuid);
                    }}
                  >
                    <div className={evaStyles.evaItemLeft}>
                      <div className={`${evaStyles.evaTraverseNameText}`}>
                        {getTraverseDisplay(thisTraverse?.name)}
                      </div>
                      <ModifiedIndicator
                        obj1={[thisTraverse]}
                        obj2={[
                          traversesFromDb.find((traverse) => traverse.uuid === sequenceItem.uuid),
                        ]}
                      />
                    </div>
                    <div className={evaStyles.evaItemRight}>
                      <div
                        className={evaStyles.evaItemRightItem}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={"Est traverse time"}
                        data-tooltip-place="right"
                      >
                        {displayTraverseDuration(thisTraverse)}
                      </div>

                      {runningRexFromDb &&
                        runningRexFromDb.selectedRexEvaUuid === evaUuid &&
                        traverses.find((traverse) => traverse.uuid === sequenceItem.uuid)
                          ?.rexStatus === "in-progress" && (
                          <div
                            className={evaStyles.evaItemRightItem}
                            data-tooltip-id="aegis-tooltip"
                            data-tooltip-html={"Time remaining"}
                            data-tooltip-place="right"
                          >
                            {displayInProgressItemTimeRemaining(
                              secondsFromhhmmss(rexPetTime),
                              sequenceItem.uuid
                            )}
                          </div>
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

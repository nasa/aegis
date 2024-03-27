import { ModifiedIndicator } from "components/interface/_global-elements";
import { Dropdown } from "components/interface/form/globalFields";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  secondsFromhhmmss,
  hhmmssFromSeconds,
  hmmFromMinutes,
  decodeEmoji,
} from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import {
  thunkChangeStationInEva,
  thunkDeleteStationFromEva,
  thunkReorderStationInEva,
} from "store/thunk/thunkEva";
import { getRexStatusDisplayProperties } from "../../../utils/rex";
import _ from "lodash";
import PetInterval from "components/interface/page/petInterval";
import { RexStatusMenu } from "../rex/rex";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByStation,
} from "store/processing/calculatedFields";

const SequenceItemStation: FunctionComponent<{
  evaUuid: string;
  stationUuid: string;
  editMode: boolean;
  isRexRunning: boolean;
  evaSequence: EvaSequenceItem[];
}> = ({ evaUuid, stationUuid, editMode, isRexRunning, evaSequence }) => {
  const dispatch = useAppDispatch();

  const stationsData = useAppSelector((state) => {
    const stations = _.sortBy(state.station.stations, ["name"]);
    return stations.map((s) => {
      return {
        name: s.name,
        uuid: s.uuid,
        location: s.location,
      };
    });
  }, deepEqual);
  const thisStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === stationUuid),
    deepEqual
  );
  const thisStationFromDb = useAppSelector(
    (state) => state.station.stationsFromDb.find((station) => station.uuid === stationUuid),
    deepEqual
  );
  const thisStationCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByStation({
        stationUuid,
        wholeStoreState: state,
      }),
    deepEqual
  );

  const stationRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.isRunning);
    if (!rex || !rex.stationEntries) return null;
    return _.last(rex.stationEntries[stationUuid])?.rexStatus;
  }, shallowEqual);

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const sequenceItemMetadata = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid,
        wholeStoreState: state,
      })?.sequenceItemsCalculatedData?.find((sequenceItem) => sequenceItem.uuid === stationUuid),
    deepEqual
  );

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const index = evaSequence.findIndex((s) => s.uuid === stationUuid);

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");
  const [evaSequenceStyle, setEvaSequenceStyle] = useState<string>(null);

  useEffect(() => {
    let isEvaSequenceItemSelectedOrHoveredStyle = null;
    if (stationUuid === selectedEvaSequenceItemUuid) {
      isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameSelected;
    } else if (stationUuid === hoverItemUuid) {
      isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameHoverMode;
    }

    // add rex status styles
    if (isRexRunning) {
      if (stationRexStatus === "in-progress") {
        isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexInProgress;
        if (stationUuid === selectedEvaSequenceItemUuid) {
          isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexInProgressSelected;
        }
      } else if (stationRexStatus === "complete") {
        isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexComplete;
        if (stationUuid === selectedEvaSequenceItemUuid) {
          isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameSelected;
        }
      } else if (stationRexStatus === "skipped") {
        isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexSkipped;
        if (stationUuid === selectedEvaSequenceItemUuid) {
          isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexSkippedSelected;
        }
      }
    }
    setEvaSequenceStyle(isEvaSequenceItemSelectedOrHoveredStyle);
  }, [hoverItemUuid, isRexRunning, stationRexStatus, selectedEvaSequenceItemUuid, stationUuid]);

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

  const displayStationDwellTime = useCallback(() => {
    const durationMinutes = thisStationCalculatedFields?.totalDwellTime.durationUpper || null;
    return !isNaN(durationMinutes) ? hmmFromMinutes(durationMinutes) : "N/A";
  }, [thisStationCalculatedFields]);

  const displayInProgressItemTimeRemaining = useCallback(
    (rexPetSeconds: number) => {
      if (!sequenceItemMetadata) return "N/A";
      const secondsRemaining = (sequenceItemMetadata.endSeconds - rexPetSeconds) * -1;
      return hhmmssFromSeconds(secondsRemaining);
    },
    [sequenceItemMetadata]
  );

  const handleSequenceItemClick = useCallback(
    (sequenceItemUuid: string) => {
      if (selectedEvaSequenceItemUuid === sequenceItemUuid) {
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
        dispatch(setSelectedEvaRightNavItem("info_panel"));
      } else {
        dispatch(setSelectedEvaUuid(evaUuid));
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid }));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      }
    },
    [dispatch, evaUuid, selectedEvaSequenceItemUuid]
  );

  return (
    <div className={evaStyles.evaSequence}>
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />

      <div
        className={evaStyles.evaItem}
        key={`${index}${evaUuid}${stationUuid}`}
        onMouseEnter={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: stationUuid, mapItemType: "station" }));
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
      >
        {thisStation ? (
          <div className={evaStyles.iconCustom}>{decodeEmoji(thisStation.icon)}</div>
        ) : (
          <div className={evaStyles.iconCustom} />
        )}

        {isRexRunning && (
          <RexStatusMenu
            rexStatus={stationRexStatus}
            divClassName={evaStyles.rexStatusWrapper}
            entryType="station"
            uuid={stationUuid}
            editPerms={editPerms}
          />
        )}

        {!editMode ? (
          <div
            className={`${evaStyles.evaItemName} ${evaSequenceStyle} ${
              getRexStatusDisplayProperties(stationRexStatus).customTextClassName
            }`}
            onClick={() => {
              if (editMode) return;

              handleSequenceItemClick(stationUuid);
            }}
          >
            <div className={evaStyles.evaItemLeft}>
              <div className={evaStyles.evaItemNameText}>
                {thisStation?.name ? thisStation?.name : `< Station not selected >`}
              </div>
              <ModifiedIndicator obj1={[thisStation]} obj2={[thisStationFromDb]} />
            </div>
            <div className={evaStyles.evaItemRight}>
              <div
                className={evaStyles.evaItemRightItem}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Total dwell time (h:mm)"}
                data-tooltip-place="right"
              >
                {displayStationDwellTime()}
              </div>

              {isRexRunning && stationRexStatus === "in-progress" && (
                <div
                  className={evaStyles.evaItemRightItem}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={"Time remaining (hh:mm:ss)"}
                  data-tooltip-place="right"
                >
                  {displayInProgressItemTimeRemaining(secondsFromhhmmss(rexPetTime))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={`${evaStyles.evaItemName} ${evaStyles.editMode} ${evaSequenceStyle}`}>
            <div className={evaStyles.evaItemLeft}>
              <Dropdown
                selected={stationUuid}
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
                {stationsData.map((stationData) => {
                  const stationAlreadyInSequence = evaSequence.find(
                    (sequenceItem) => sequenceItem.uuid === stationData.uuid
                  );
                  if (
                    (stationAlreadyInSequence && stationData.uuid !== stationUuid) ||
                    !stationData.location
                  )
                    return null;
                  return (
                    <option key={stationData.uuid} value={stationData.uuid}>
                      {stationData.name}
                    </option>
                  );
                })}
              </Dropdown>
            </div>
            <div className={evaStyles.evaItemNameButtons}>
              <div
                className={`${evaStyles.evaItemNameButton} ${index === 1 && evaStyles.disabled}`}
                onClick={() => {
                  if (index === 1) return;
                  handleMoveStationUp(index);
                }}
              >
                <FontAwesomeIcon icon={faArrowUp} />
              </div>
              <div
                className={`${evaStyles.evaItemNameButton} ${
                  index === evaSequence.length - 2 && evaStyles.disabled
                }`}
                onClick={() => {
                  if (index === evaSequence.length - 2) return;
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
      </div>
    </div>
  );
};

export default SequenceItemStation;

import { ModifiedIndicator } from "components/interface/_global-elements";
import { Dropdown } from "components/interface/form/globalFields";
import { FunctionComponent, useCallback } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { hmmFromMinutes, isNotNumber } from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import { setHoverUuidsForSequence } from "store/hover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import {
  thunkChangeStationInEva,
  thunkDeleteStationFromEva,
  thunkReorderStationInEva,
} from "store/thunk/thunkEva";
import { getRexStatusDisplayProperties } from "../../../utils/component-helpers";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";
import { selectAsPlannedStations } from "store/selectors";
import { createFolderOrganizedDropdownOptions } from "utils/folder-dropdown";

const SequenceItemStation: FunctionComponent<{
  evaUuid: string;
  stationUuid: string;
  isRexRunning: boolean; // if the eva that this station belongs to is in a running rex
}> = ({ evaUuid, stationUuid }) => {
  const dispatch = useAppDispatch();

  const isRexEva = useAppSelector((state) => {
    const rexEvaUuids = state.rex.rexes.map((rex) => rex.evaUuid);
    return rexEvaUuids.includes(evaUuid);
  }, refEqual);
  const editMode = useAppSelector((state) => state.eva.evasEditing.includes(evaUuid), refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const thisStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === stationUuid),
    deepEqual
  );
  const thisStationFromDb = useAppSelector(
    (state) => state.station.stationsFromDb.find((station) => station.uuid === stationUuid),
    deepEqual
  );
  const evaSequence = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid)?.sequence,
    deepEqual
  );
  const sequenceIndex = evaSequence.findIndex((s) => s.uuid === stationUuid);

  // get a list of stations for the dropdown menu when selecting a station for the eva sequence
  // only return some of the properties in station to reduce re-renders
  const partialStationsForDropdown = useAppSelector((state) => {
    const asPlannedStations = selectAsPlannedStations(state).map((s) => {
      return { name: s.name, uuid: s.uuid, location: s.location };
    });
    // add on the current station if it is not already in the list (this will occur in a rex's eva)
    if (!asPlannedStations.map((s) => s.uuid).includes(stationUuid)) {
      const station = state.station.stations.find((s) => s.uuid === stationUuid);
      if (station) {
        asPlannedStations.unshift({
          name: `${station?.name} (As Executed)`,
          uuid: station?.uuid,
          location: station?.location,
        });
      }
    }
    return asPlannedStations;
  }, deepEqual);

  // Get folder data for stations
  const folders = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "station"),
    deepEqual
  );

  // Create a mapping from station UUIDs to their folder UUIDs
  const itemsToFolders = folders.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});

  // Generate organized station dropdown options with custom filtering
  const stationDropdownOptions = createFolderOrganizedDropdownOptions({
    items: partialStationsForDropdown,
    folders,
    itemsToFolders,
    filterFn: (partialStation) => {
      // filter out stations that are already in the sequence and stations that don't have locations
      // for rex, all the stations are duplicated so we need to get the as-planned copies.
      const isStationInSequence = evaSequence.map((s) => s.uuid).includes(partialStation.uuid);
      return (
        !(isStationInSequence && partialStation.uuid !== stationUuid) && !!partialStation.location
      );
    },
  });

  const thisStationCalculatedFields = useAppSelector((state) => {
    const station = state.station.stations.find((s) => s.uuid === stationUuid);
    const stationActions = state.action.actions.filter(
      (a) => a.stationUuid === stationUuid && a.enabled
    );
    return getCalculatedFieldsByStation({
      station,
      missionWalkbackRate: state.mission.mission.walkbackRate,
      stationActions,
    });
  }, deepEqual);

  const stationRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.evaUuid === evaUuid);
    if (!rex || !rex.stationEntries) return null;
    return rex.stationEntries[stationUuid]?.rexStatus;
  }, shallowEqual);

  const rexMaestroControlled = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning)?.maestroControlled,
    refEqual
  );

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  // returns the rex from db object if this is a rex eva and is executing
  const rexFromDbIfExecuting = useAppSelector((state) => {
    if (!isRexEva) return null;
    return state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === evaUuid);
  }, deepEqual);

  // determine styling
  let evaSequenceStyle = null;
  if (stationUuid === selectedEvaSequenceItemUuid) {
    evaSequenceStyle = evaStyles.evaItemNameSelected;
  } else if (stationUuid === hoverItemUuid) {
    evaSequenceStyle = evaStyles.evaItemNameHoverMode;
  }
  if (isRexEva) {
    if (stationRexStatus === "in-progress") {
      evaSequenceStyle = evaStyles.evaItemNameRexInProgress;
      if (stationUuid === selectedEvaSequenceItemUuid) {
        evaSequenceStyle = evaStyles.evaItemNameRexInProgressSelected;
      }
    } else if (stationRexStatus === "complete") {
      evaSequenceStyle = evaStyles.evaItemNameRexComplete;
      if (stationUuid === selectedEvaSequenceItemUuid) {
        evaSequenceStyle = evaStyles.evaItemNameSelected;
      }
    } else if (stationRexStatus === "skipped") {
      evaSequenceStyle = evaStyles.evaItemNameRexSkipped;
      if (stationUuid === selectedEvaSequenceItemUuid) {
        evaSequenceStyle = evaStyles.evaItemNameRexSkippedSelected;
      }
    }
  }

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
    const durationMinutes = isNotNumber(thisStation?.duration)
      ? (thisStationCalculatedFields?.totalDwellTime ?? null)
      : thisStation.duration;
    return isNotNumber(durationMinutes) ? "N/A" : hmmFromMinutes(durationMinutes);
  }, [thisStation?.duration, thisStationCalculatedFields?.totalDwellTime]);

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
      <div
        className={evaStyles.evaItem}
        key={`${sequenceIndex}${evaUuid}${stationUuid}`}
        onMouseEnter={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: stationUuid, mapItemType: "station" }));
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
      >
        <div className={evaStyles.iconCustom}>
          <EmojiRenderer
            iconValue={thisStation?.icon ? thisStation.icon : "2754"}
            customSizeEm={1.4}
          />
        </div>

        {isRexEva && (
          <RexStatusMenu
            rexStatus={stationRexStatus}
            divClassName={evaStyles.rexStatusWrapper}
            entryType="station"
            uuid={stationUuid}
            editPerms={!!(editPerms && rexFromDbIfExecuting)} // the !! converts result into boolean
            maestroControlled={rexMaestroControlled}
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
            </div>
          </div>
        ) : (
          <div className={`${evaStyles.evaItemName} ${evaStyles.editMode} ${evaSequenceStyle}`}>
            <div className={evaStyles.evaItemLeft}>
              <Dropdown
                selected={thisStation?.uuid || ""}
                arrowStyle={{ top: "1px" }}
                selectStyle={{ width: "100%" }}
                onChange={(val) => {
                  dispatch(
                    thunkChangeStationInEva({
                      evaSequence,
                      sequenceIndex: sequenceIndex,
                      newStationUuid: val,
                      evaUuid,
                    })
                  );
                }}
                toolTip="Station"
              >
                <option value="">-- Select a station --</option>
                {stationDropdownOptions}
              </Dropdown>
            </div>
            <div className={evaStyles.evaItemNameButtons}>
              <div
                className={`${evaStyles.evaItemNameButton} ${sequenceIndex === 1 && evaStyles.disabled}`}
                onClick={() => {
                  if (sequenceIndex === 1) return;
                  handleMoveStationUp(sequenceIndex);
                }}
              >
                <FontAwesomeIcon icon={faArrowUp} />
              </div>
              <div
                className={`${evaStyles.evaItemNameButton} ${
                  sequenceIndex === evaSequence.length - 2 && evaStyles.disabled
                }`}
                onClick={() => {
                  if (sequenceIndex === evaSequence.length - 2) return;
                  handleMoveStationDown(sequenceIndex);
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
                      sequenceIndex: sequenceIndex,
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

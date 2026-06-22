import { Dropdown } from "components/interface/form/globalFields";
import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";
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
  thunkDocChangeStationInEva,
  thunkDocDeleteStationFromEva,
  thunkDocReorderStationInEva,
} from "store/thunk/thunkEva";
import { getRexStatusDisplayProperties, getSequenceItemRowStyles } from "utils/component-helpers";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";

import { selectAsPlannedStations } from "store/selectors";
import { createFolderOrganizedDropdownOptions } from "utils/folder-dropdown";
import { useMissionDocSelector } from "utils/useDocSelector";

const SequenceItemStation: FunctionComponent<{
  evaUuid: string;
  stationUuid: string;
  isRexRunning: boolean; // if the eva that this station belongs to is in a running rex
}> = ({ evaUuid, stationUuid }) => {
  const dispatch = useAppDispatch();
  const missionWalkbackRate = useMissionDocSelector((mission) => mission.walkbackRate, refEqual);
  const isRexEva = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).some((rex) => rex.evaUuid === evaUuid);
  }, refEqual);
  const editMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const thisStation = useMissionDocSelector((mission) => mission.stations[stationUuid], deepEqual);
  const evaSequence = useMissionDocSelector(
    (mission) => mission.evas?.[evaUuid]?.sequence,
    deepEqual
  );
  const sequenceIndex = evaSequence.findIndex((s) => s.uuid === stationUuid);

  // get a list of stations for the dropdown menu when selecting a station for the eva sequence
  // only return some of the properties in station to reduce re-renders
  const partialStationsForDropdown = useMissionDocSelector((mission) => {
    const asPlannedStations = selectAsPlannedStations(mission).map((s) => {
      return { name: s.name, uuid: s.uuid, location: s.location };
    });
    // add on the current station if it is not already in the list (this will occur in a rex's eva)
    if (!asPlannedStations.map((s) => s.uuid).includes(stationUuid)) {
      const station = thisStation;
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

  const thisStationCalculatedFields = useMissionDocSelector((mission) => {
    const stationActions = Object.values(mission.actions || {}).filter(
      (a) => a.stationUuid === stationUuid && a.enabled
    );
    return getCalculatedFieldsByStation({
      station: mission.stations ? mission.stations[stationUuid] : null,
      missionWalkbackRate,
      stationActions,
    });
  }, deepEqual);

  const stationRexStatus = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return null;
    const rex = Object.values(mission.rexes).find((rex) => rex.evaUuid === evaUuid);
    if (!rex || !rex.stationEntries) return null;
    return rex.stationEntries[stationUuid]?.rexStatus;
  }, shallowEqual);

  const rexMaestroControlled = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).find((rex) => rex.isRunning)?.maestroControlled ?? false;
  }, refEqual);

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  // returns the running rex if this is a rex eva and is executing
  const rexFromDbIfExecuting = useMissionDocSelector((mission) => {
    if (!isRexEva || !mission?.rexes) return null;
    return (
      Object.values(mission.rexes).find((rex) => rex.isRunning && rex.evaUuid === evaUuid) ?? null
    );
  }, deepEqual);

  const handleMoveStationUp = (index: number) => {
    dispatch(
      thunkDocReorderStationInEva({
        direction: "up",
        evaSequence: evaSequence,
        stationIndex: index,
        evaUuid: evaUuid,
      })
    );
  };

  const handleMoveStationDown = (index: number) => {
    dispatch(
      thunkDocReorderStationInEva({
        direction: "down",
        evaSequence: evaSequence,
        stationIndex: index,
        evaUuid: evaUuid,
      })
    );
  };

  const displayedStationDwellTime = useMemo(() => {
    const durationMinutes = isNotNumber(thisStation?.duration)
      ? (thisStationCalculatedFields?.totalDwellTime ?? null)
      : thisStation?.duration;
    return isNotNumber(durationMinutes) ? "N/A" : hmmFromMinutes(durationMinutes);
  }, [thisStation, thisStationCalculatedFields]);

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

  const { rowClassName, nameClassName } = getSequenceItemRowStyles({
    rexStatus: stationRexStatus,
    isSelected: stationUuid === selectedEvaSequenceItemUuid,
    isHovered: stationUuid === hoverItemUuid,
    isRexEva,
  });

  return (
    <div className={evaStyles.evaSequence}>
      <div
        className={`${evaStyles.evaItem} ${rowClassName}`}
        key={`${sequenceIndex}${evaUuid}${stationUuid}`}
        onMouseEnter={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: stationUuid, mapItemType: "station" }));
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
        onClick={() => handleSequenceItemClick(stationUuid)}
        style={{ cursor: "pointer" }}
      >
        <div className={evaStyles.iconCustom}>
          <EmojiRenderer
            iconValue={thisStation?.icon ? thisStation.icon : "2754"}
            customSizeEm={1.4}
          />
        </div>

        {isRexEva && stationUuid && (
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
            className={`${evaStyles.evaItemName} ${nameClassName} ${
              getRexStatusDisplayProperties(stationRexStatus).customTextClassName ?? ""
            }`}
          >
            <div className={evaStyles.evaItemLeft}>
              <div className={evaStyles.evaItemNameText}>
                {thisStation?.name ? thisStation?.name : `< Station not selected >`}
              </div>
            </div>
            <div className={evaStyles.evaItemRight}>
              <div
                className={evaStyles.evaItemRightItem}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Total dwell time (h:mm)"}
                data-tooltip-place="right"
              >
                {displayedStationDwellTime}
              </div>
            </div>
          </div>
        ) : (
          <div className={evaStyles.evaItemName}>
            <div className={evaStyles.evaItemLeft}>
              <Dropdown
                selected={thisStation?.uuid || ""}
                arrowStyle={{ top: "1px" }}
                selectStyle={{ width: "100%" }}
                onChange={(val) => {
                  dispatch(
                    thunkDocChangeStationInEva({
                      sequenceIndex: sequenceIndex,
                      newStationUuid: val,
                      oldStationUuid: stationUuid,
                      evaUuid,
                      isRexEva,
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
                    thunkDocDeleteStationFromEva({
                      evaSequence,
                      sequenceIndex: sequenceIndex,
                      evaUuid,
                      isRexEva,
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

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
  thunkDocChangeIngressEgress,
  thunkDocChangeStationInEva,
  thunkDocDeleteStationFromEva,
  thunkDocReorderStationInEva,
} from "store/thunk/thunkEva";
import { getRexStatusDisplayProperties, getSequenceItemRowStyles } from "utils/component-helpers";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { getCalcFieldsForStation } from "store/processing/calculatedFields";

import { selectAsPlannedStations } from "store/selectors";
import { createFolderOrganizedDropdownOptions } from "utils/folder-dropdown";
import { useMissionDocSelector } from "utils/useDocSelector";
import { canMoveStation, isXgressIndex } from "operations/helpers/evaSequence";

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
  const canMoveUp = canMoveStation(evaSequence, sequenceIndex, "up");
  const canMoveDown = canMoveStation(evaSequence, sequenceIndex, "down");

  // Egress/ingress rows are pinned to the ends of the sequence: they cannot be
  // reordered or removed, and changing their station goes through the xgress
  // thunk so lander copies are created/deleted along with the swap.
  const isXgress = isXgressIndex(evaSequence, sequenceIndex);
  const xgressType: "egress" | "ingress" | null = !isXgress
    ? null
    : sequenceIndex === 0
      ? "egress"
      : "ingress";
  const isAtLander = thisStation?.isLanderXgress === true;

  const landerLabel = `${isAtLander && thisStation?.name ? thisStation.name : "Lander"}${
    isRexEva && isAtLander ? " (As Executed)" : ""
  }`;

  // Get a list of as-planned stations for the dropdown menu when selecting a station for the eva sequence
  // Only return some of the properties in station to reduce re-renders
  // Filter out stations already in the sequence, stations without locations, and lander xgress stations
  const partialStationsForDropdown = useMissionDocSelector((mission) => {
    const sequenceRefUuids = (mission.evas?.[evaUuid]?.sequence ?? [])
      .map((s) => mission.stations[s.uuid]?.refUuid)
      .filter(Boolean);
    const asPlannedStations = selectAsPlannedStations(mission)
      .filter((s) => !sequenceRefUuids.includes(s.refUuid) && !!s.location && !s.isLanderXgress)
      .map((s) => ({ name: s.name, uuid: s.uuid, location: s.location }));

    // add on the current station. A lander copy is not selectable as itself —
    // the row offers a dedicated "Lander" option instead.
    if (
      !asPlannedStations.map((s) => s.uuid).includes(stationUuid) &&
      !thisStation?.isLanderXgress
    ) {
      const station = thisStation;
      if (station) {
        asPlannedStations.unshift({
          name: isRexEva ? `${station?.name} (As Executed)` : station?.name,
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

  // Generate folder organized station dropdown options
  const stationDropdownOptions = createFolderOrganizedDropdownOptions({
    items: partialStationsForDropdown,
    folders,
    itemsToFolders,
  });

  const thisStationCalculatedFields = useMissionDocSelector((mission) => {
    const stationActions = Object.values(mission.actions || {}).filter(
      (a) => a.stationUuid === stationUuid && a.enabled
    );
    return getCalcFieldsForStation({
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
            imageClassName={isAtLander ? evaStyles.landerImage : undefined}
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
                data-tooltip-content={"Total dwell time (h:mm)"}
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
                selected={isAtLander ? "lander" : thisStation?.uuid || ""}
                arrowStyle={{ top: "1px" }}
                selectStyle={{ width: "100%" }}
                onChange={(val) => {
                  if (xgressType) {
                    dispatch(
                      thunkDocChangeIngressEgress({
                        type: xgressType,
                        evaUuid,
                        newStationUuidOrLander: val,
                        isRexEva,
                      })
                    );
                    return;
                  }
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
                toolTip={
                  xgressType === "egress"
                    ? "Egress Location"
                    : xgressType === "ingress"
                      ? "Ingress Location"
                      : "Station"
                }
              >
                {isXgress ? (
                  <option value="lander">{landerLabel}</option>
                ) : (
                  <option value="">-- Select a station --</option>
                )}
                {stationDropdownOptions}
              </Dropdown>
            </div>
            {/* Xgress rows are pinned to the ends of the sequence and cannot be
                reordered or removed, so they get no buttons at all. */}
            {!isXgress && (
              <div className={evaStyles.evaItemNameButtons}>
                <div
                  className={`${evaStyles.evaItemNameButton} ${!canMoveUp && evaStyles.disabled}`}
                  onClick={() => {
                    if (!canMoveUp) return;
                    handleMoveStationUp(sequenceIndex);
                  }}
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </div>
                <div
                  className={`${evaStyles.evaItemNameButton} ${!canMoveDown && evaStyles.disabled}`}
                  onClick={() => {
                    if (!canMoveDown) return;
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SequenceItemStation;

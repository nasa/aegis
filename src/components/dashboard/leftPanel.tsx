import { FunctionComponent, useState } from "react";

import styles from "./leftPanel.module.css";
import PetInterval from "components/page/petInterval";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { selectEvaStations, selecteEvaTraverses } from "store/selectors";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByStation,
} from "store/processing/calculatedFields";
import { decodeEmoji, hhmmssFromSeconds, secondsFromhhmmss } from "utils/formatting";
import isUndefined from "lodash/isUndefined";

const LeftTopPanel: FunctionComponent<{ mapDisplayPos: MapDisplayPos }> = ({ mapDisplayPos }) => {
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const runningEvaSequence = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb?.evaUuid)?.sequence,
    deepEqual
  );
  const evaStations = useAppSelector(selectEvaStations(runningRexFromDb?.evaUuid), deepEqual);
  const evaTraverses = useAppSelector(selecteEvaTraverses(runningRexFromDb?.evaUuid), deepEqual);
  const evaCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid: runningRexFromDb?.evaUuid,
        evas: state.eva.evas,
        stations: state.station.stations,
        mission: state.mission.mission,
        actions: state.action.actions,
        traverses: state.traverse.traverses,
      }),
    deepEqual
  );
  const allStationsCalculatedFields: StationCalculatedFields[] = useAppSelector((state) => {
    const calculatedFields: StationCalculatedFields[] = [];
    for (const sequenceItem of runningEvaSequence) {
      if (sequenceItem.type === "station") {
        calculatedFields.push(
          getCalculatedFieldsByStation({
            stationUuid: sequenceItem.uuid,
            stations: state.station.stations,
            mission: state.mission.mission,
            actions: state.action.actions,
          })
        );
      }
    }
    return calculatedFields;
  }, deepEqual);
  const evaDuration = useAppSelector((state) => {
    const evaDuration = state.eva.evasFromDb.find(
      (eva) => eva.uuid === runningRexFromDb?.evaUuid
    )?.duration;
    return evaDuration || state.mission.mission?.defaultEvaDuration;
  }, deepEqual);

  const eva = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb?.evaUuid),
    deepEqual
  );

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  const getColorFromPosTypeUuid = (posTypeUuid: string): string => {
    const entryPosType = runningRexFromDb?.posTypes?.find(
      (posType) => posType.uuid === posTypeUuid
    );
    return entryPosType?.pathColor;
  };

  // loop through eva sequence and find the first item that's "in-progress" in the rex and show all the data for it
  let itemInProgress = "N/A";
  let itemInProgressType = "Item";
  let sequenceItemTimeRemaining = "N/A";
  let stationWalkbackTime = "";
  let stationWalkbackDistance = "";
  let seqItemRexStatus: RexStatus;
  const egressEntry = runningRexFromDb?.xgressEntries?.["egress"];

  if (egressEntry && egressEntry?.rexStatus === "in-progress") {
    itemInProgressType = "Egress";
    const secondsRemaining = (eva.egressDuration * 60 - secondsFromhhmmss(rexPetTime)) * -1;
    sequenceItemTimeRemaining = hhmmssFromSeconds(secondsRemaining);

    // get location name
    if (eva.egressLocationUuid === "lander") {
      itemInProgress = "Lander";
    } else {
      // look up the egress location station name using uuid
      itemInProgress = evaStations.find((s) => s.uuid === eva.egressLocationUuid)?.name;
    }
  }

  for (const sequenceItem of runningEvaSequence) {
    if (sequenceItem.type === "station") {
      seqItemRexStatus =
        (runningRexFromDb?.stationEntries &&
          runningRexFromDb?.stationEntries[sequenceItem.uuid]?.rexStatus) ||
        "pending";
    } else if (sequenceItem.type === "traverse") {
      seqItemRexStatus =
        (runningRexFromDb?.traverseEntries &&
          runningRexFromDb?.traverseEntries[sequenceItem.uuid]?.rexStatus) ||
        "pending";
    }
    if (seqItemRexStatus === "in-progress") {
      if (sequenceItem.type === "station") {
        itemInProgressType = "Station";
        itemInProgress = evaStations.find((s) => s.uuid === sequenceItem.uuid)?.name || "";
        stationWalkbackTime = allStationsCalculatedFields
          .find((s) => s.uuid === sequenceItem.uuid)
          ?.walkbackDurationMinutes?.toFixed(0);
        stationWalkbackDistance = allStationsCalculatedFields
          .find((s) => s.uuid === sequenceItem.uuid)
          ?.walkbackDistanceMeters?.toFixed(0);
      } else if (sequenceItem.type === "traverse") {
        itemInProgressType = "Traverse";
        itemInProgress = evaTraverses.find((t) => t.uuid === sequenceItem.uuid)?.name || "";
      }
      const sequenceItemMetadata = evaCalculatedFields.sequenceItemsCalculatedData.find(
        (si) => si.uuid === sequenceItem.uuid
      );
      const secondsRemaining =
        (sequenceItemMetadata.manualEndSeconds - secondsFromhhmmss(rexPetTime)) * -1;
      sequenceItemTimeRemaining = hhmmssFromSeconds(secondsRemaining);
      break;
    }
  }

  const ingressEntry = runningRexFromDb?.xgressEntries?.["ingress"];

  if (ingressEntry && ingressEntry?.rexStatus === "in-progress") {
    itemInProgressType = "Ingress";
    const secondsRemaining =
      (evaDuration * 60 + eva.ingressDuration * 60 - secondsFromhhmmss(rexPetTime)) * -1;
    sequenceItemTimeRemaining = hhmmssFromSeconds(secondsRemaining);

    // get location name
    if (eva.egressLocationUuid === "lander") {
      itemInProgress = "Lander";
    } else {
      // look up the ingres location station name using uuid
      itemInProgress = evaStations.find((s) => s.uuid === eva.egressLocationUuid)?.name;
    }
  }

  return (
    <>
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <div className={styles.container}>
        <div className={styles.row}>
          <div className={styles.dataCell}>
            <div className={styles.label}>EVA PET</div>
            <div
              className={styles.valueHalf}
              style={{
                color: "var(--rex)",
              }}
            >
              {rexPetTime}
            </div>
          </div>
          <div className={styles.dataCell}>
            <div className={styles.label}>Total Duration</div>
            <div className={styles.valueHalf}>{hhmmssFromSeconds(evaDuration * 60)}</div>
          </div>
        </div>
        <div className={styles.break} />
        <div className={styles.row}>
          <div className={styles.dataCell}>
            <div className={styles.label}>{itemInProgressType} in Progress</div>
            <div className={styles.valueFull}>{itemInProgress}</div>
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.dataCell}>
            <div className={styles.label}>{itemInProgressType} Time Remaining</div>
            <div className={styles.valueHalf}>{sequenceItemTimeRemaining}</div>
          </div>
        </div>
        {itemInProgressType === "Station" && (
          <div className={styles.row}>
            <div className={styles.dataCell}>
              <div className={styles.label}>Station Walkback</div>
              <div className={styles.valueHalf}>{stationWalkbackTime} mins</div>
            </div>
            <div className={styles.dataCell}>
              <div className={styles.label}>&nbsp;</div>
              <div className={styles.valueHalf}>{stationWalkbackDistance}m</div>
            </div>
          </div>
        )}
        <div className={styles.break} />
        <div className={styles.row}>
          <div className={styles.dataCell}>
            <div className={styles.label}>Position Item</div>
          </div>
          <div className={styles.dataCell}>
            <div className={styles.label}>Est Position Age</div>
          </div>
        </div>
        {runningRexFromDb.posTypes.map((posType) => {
          let latestEntrySecondsForType: number;
          let latestCreationDate: string;
          if (Array.isArray(runningRexFromDb.posEntries)) {
            runningRexFromDb.posEntries.forEach((entry) => {
              // whether or not to show the entry based on what is selected in the eyeball menu
              const showEntry =
                mapDisplayPos.sourceUuids.includes(entry.posSourceUuid) ||
                mapDisplayPos.sourceUuids.length === 0; // "all" is selected
              if (entry.posTypeUuids.includes(posType.uuid) && showEntry) {
                if (!latestCreationDate || entry.createdAt > latestCreationDate) {
                  latestCreationDate = entry.createdAt;
                  latestEntrySecondsForType = entry.petSeconds;
                }
              }
            });
          }
          const age = !isUndefined(latestEntrySecondsForType)
            ? hhmmssFromSeconds(latestEntrySecondsForType - secondsFromhhmmss(rexPetTime)).replace(
                "-",
                "+"
              )
            : "N/A";
          return (
            <div
              className={styles.row}
              key={posType.uuid}
              style={{ paddingTop: "0", paddingBottom: "3px" }}
            >
              <div className={styles.dataCell}>
                <div
                  className={styles.valueHalf}
                  style={{ fontFamily: "Inter", fontSize: "1.8em" }}
                >
                  <div className={styles.posContainer}>
                    {posType.name.substring(0, 2) === "EV" ? (
                      <div className={styles.mapEVIcon}>
                        <img
                          style={{
                            width: "30px",
                          }}
                          src="/images/astronaut_outline.svg"
                        ></img>
                      </div>
                    ) : (
                      <>{decodeEmoji(posType.icon)}</>
                    )}
                    <div
                      className={styles.posBar}
                      style={{ backgroundColor: getColorFromPosTypeUuid(posType.uuid) }}
                    ></div>
                  </div>
                  <div
                    className={styles.posText}
                    style={{
                      color: "var(--grey4)",
                    }}
                  >
                    {posType.name}
                  </div>
                </div>
              </div>
              <div className={styles.dataCell}>
                <div
                  className={styles.valueHalf}
                  style={{
                    color: "var(--grey4)",
                  }}
                >
                  {age}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default LeftTopPanel;

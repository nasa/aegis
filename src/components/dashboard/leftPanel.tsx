import { useState } from "react";

import styles from "./leftPanel.module.css";
import PetInterval from "components/page/petInterval";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { selectEvaStations, selecteEvaTraverses } from "store/selectors";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByStation,
} from "store/processing/calculatedFields";
import { decodeEmoji, hhmmssFromSeconds, secondsFromhhmmss } from "utils/formatting";
import _, { isUndefined } from "lodash";

const LeftTopPanel = (): JSX.Element => {
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
        wholeStoreState: state,
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
            wholeStoreState: state,
          })
        );
      }
    }
    return calculatedFields;
  }, deepEqual);
  const evaMaxDuration = useAppSelector((state) => {
    const evaDuration = state.eva.evasFromDb.find(
      (eva) => eva.uuid === runningRexFromDb?.evaUuid
    )?.maxDuration;
    return evaDuration || state.mission.mission?.defaultEvaDuration;
  }, deepEqual);

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
  for (const sequenceItem of runningEvaSequence) {
    let seqItemRexStatus: RexStatus;
    if (sequenceItem.type === "station") {
      seqItemRexStatus = _.last(
        runningRexFromDb?.stationEntries && runningRexFromDb?.stationEntries[sequenceItem.uuid]
      )?.rexStatus;
    } else if (sequenceItem.type === "traverse") {
      seqItemRexStatus = _.last(
        runningRexFromDb?.traverseEntries && runningRexFromDb?.traverseEntries[sequenceItem.uuid]
      )?.rexStatus;
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
        (sequenceItemMetadata.endSeconds - secondsFromhhmmss(rexPetTime)) * -1;
      sequenceItemTimeRemaining = hhmmssFromSeconds(secondsRemaining);
      break;
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
            <div className={styles.valueHalf}>{hhmmssFromSeconds(evaMaxDuration * 60)}</div>
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
              if (entry.posTypeUuids.includes(posType.uuid)) {
                if (!latestCreationDate || entry.createdAt > latestCreationDate) {
                  latestCreationDate = entry.createdAt;
                  latestEntrySecondsForType = entry.seconds;
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

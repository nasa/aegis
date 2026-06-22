import type { FunctionComponent } from "react";
import { useLayoutEffect, useRef } from "react";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { EmojiRenderer } from "components/interface/emojis";
import styles from "./activities.module.css";
import { selectConvertMaestroActivityPropertiesByRefUuidToUuid } from "store/selectors";

const Activities: FunctionComponent<{
  sequenceItems: EVASequenceItemForTimeline[];
  pixelsPerSecondY: number;
  rex: Rex;
}> = ({ sequenceItems, pixelsPerSecondY, rex }) => {
  const maestroActivityProperties = useMissionDocSelector(
    (mission) =>
      selectConvertMaestroActivityPropertiesByRefUuidToUuid(mission, {
        maestroActivityPropertiesByRefUuid: rex?.maestroActivityPropertiesByRefUuid,
        rexUuid: rex?.uuid || "",
      }),
    deepEqual
  );

  return (
    <div className={styles.activityIndicators}>
      {sequenceItems.map((sequenceItem) => {
        return (
          <Activity
            key={sequenceItem.uuid}
            sequenceItem={sequenceItem}
            pixelsPerSecondY={pixelsPerSecondY}
            rex={rex}
            activityNumber={sequenceItems.indexOf(sequenceItem) + 1}
            maestroActivityProperties={maestroActivityProperties}
          />
        );
      })}
    </div>
  );
};

const Activity: FunctionComponent<{
  sequenceItem: EVASequenceItemForTimeline;
  pixelsPerSecondY: number;
  rex: Rex;
  activityNumber?: number;
  maestroActivityProperties: MaestroActivityProperties;
}> = ({ sequenceItem, pixelsPerSecondY, rex, activityNumber, maestroActivityProperties }) => {
  const activityRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (activityRef.current) {
      activityRef.current.style.top = `${sequenceItem.secondsStart * pixelsPerSecondY}px`;
      activityRef.current.style.height = `${sequenceItem.totalDurationMins * 60 * pixelsPerSecondY}px`;
    }
  }, [sequenceItem, pixelsPerSecondY]);

  let complete = false;
  let inProgress = false;
  let ev1PercentComplete = 0;
  let ev2PercentComplete = 0;
  if (sequenceItem.type === "station") {
    let entry = rex?.stationEntries ? rex?.stationEntries[sequenceItem.uuid] : null;
    if (sequenceItem.uuid === "egress" || sequenceItem.uuid === "ingress") {
      entry = rex?.xgressEntries ? rex?.xgressEntries[sequenceItem.uuid] : null;
    } else {
      entry = rex?.stationEntries ? rex?.stationEntries[sequenceItem.uuid] : null;
    }
    complete = entry?.rexStatus === "complete" || entry?.rexStatus === "skipped";
    inProgress = entry?.rexStatus === "in-progress";
    ev1PercentComplete = entry?.maestroPercentCompleteEv1 || 0;
    ev2PercentComplete = entry?.maestroPercentCompleteEv2 || 0;
  } else if (sequenceItem.type === "traverse") {
    // find the traverseEntry in the rex for this traverse
    const traverseEntry = rex?.traverseEntries ? rex?.traverseEntries[sequenceItem.uuid] : null;
    complete = traverseEntry?.rexStatus === "complete" || traverseEntry?.rexStatus === "skipped";
    inProgress = traverseEntry?.rexStatus === "in-progress";
    ev1PercentComplete = traverseEntry?.maestroPercentCompleteEv1 || 0;
    ev2PercentComplete = traverseEntry?.maestroPercentCompleteEv2 || 0;
  }

  const boxColor = maestroActivityProperties[sequenceItem.uuid]?.color;

  let backgroundColor = null;
  if (complete) {
    backgroundColor = "var(--grey4)";
  } else if (inProgress) {
    backgroundColor = "var(--rex)";
  }

  // set display number to what was provided by maestro. If nothing was provided, use the iterative number from parent component
  const displayNumber = maestroActivityProperties[sequenceItem.uuid]?.number || activityNumber;
  const displayNumberIsNumeric = !isNaN(Number(displayNumber));

  let stationIcon;
  if (sequenceItem.uuid === "egress" || sequenceItem.uuid === "ingress") {
    stationIcon = sequenceItem.icon ? (
      <EmojiRenderer iconValue={sequenceItem.icon} />
    ) : (
      <img src="/images/lander.svg" alt="lander" className={styles.landerImage} />
    );
  } else {
    stationIcon = <EmojiRenderer iconValue={sequenceItem.icon ? sequenceItem.icon : "2754"} />;
  }

  return (
    <div
      ref={activityRef}
      className={styles.activityIndicator}
      style={{
        backgroundColor: backgroundColor,
      }}
    >
      <div className={styles.evBox}>
        <div className={styles.evBoxColorLine} style={{ backgroundColor: boxColor }}></div>
        <div className={styles.evBoxMain}>
          <div
            className={displayNumberIsNumeric ? styles.activityNumber : styles.activityNumberLetter}
          >
            {displayNumber}
          </div>
          {sequenceItem.type === "station" && (
            <div className={styles.stationIcon}>{stationIcon}</div>
          )}
          {inProgress && (
            <div
              className={styles.progressIndicator}
              style={{ height: `${ev1PercentComplete}%` }}
            ></div>
          )}
        </div>
      </div>
      <div className={styles.evBox}>
        <div className={styles.evBoxColorLine} style={{ backgroundColor: boxColor }}></div>
        <div className={styles.evBoxMain}>
          <div className={styles.activityNumber}>{displayNumber}</div>
          {sequenceItem.type === "station" && (
            <div className={styles.stationIcon}>{stationIcon}</div>
          )}
        </div>
        {inProgress && (
          <div
            className={styles.progressIndicator}
            style={{ height: `${ev2PercentComplete}%` }}
          ></div>
        )}
      </div>
    </div>
  );
};

export default Activities;

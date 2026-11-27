import type { FunctionComponent } from "react";
import { useLayoutEffect, useRef } from "react";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { EmojiRenderer } from "components/interface/emojis";
import { resolveDisplayedRexStatus } from "utils/component-helpers";
import styles from "./activities.module.css";

const Activities: FunctionComponent<{
  sequenceItems: EVASequenceItemForTimeline[];
  pixelsPerSecondY: number;
  rex: Rex;
}> = ({ sequenceItems, pixelsPerSecondY, rex }) => {
  const maestroActivityProperties = useMissionDocSelector(
    (mission) => mission.rexes?.[rex?.uuid]?.maestroActivityProperties ?? {},
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

  const entry =
    sequenceItem.type === "station"
      ? (rex?.stationEntries?.[sequenceItem.uuid] ?? null)
      : sequenceItem.type === "traverse"
        ? (rex?.traverseEntries?.[sequenceItem.uuid] ?? null)
        : null;

  const rexStatus = resolveDisplayedRexStatus(entry);
  const inProgress = rexStatus === "in-progress";
  // The activity as a whole, which finishes both crews regardless of what
  // Maestro reported per crew. The dashboard shows skipped with the complete grey.
  const activityComplete = rexStatus === "complete" || rexStatus === "skipped";
  const ev1PercentComplete = entry?.maestroPercentCompleteEv1 || 0;
  const ev2PercentComplete = entry?.maestroPercentCompleteEv2 || 0;

  const boxColor = maestroActivityProperties[sequenceItem.uuid]?.color;

  /**
   * Each crew's box is colored from that crew's own progress, so one crew can
   * read complete (grey) while the other is still working (green). Maestro
   * reports the two percentages independently and keeps the activity
   * "in-progress" until both are done.
   */
  const crewComplete = (percentComplete: number) => activityComplete || percentComplete === 100;
  const crewBackgroundColor = (percentComplete: number): string | null => {
    if (crewComplete(percentComplete)) return "var(--grey4)";
    // Maestro does not report whether a crew has started, so a crew at 0%
    // stays uncolored even while the activity is in progress.
    if (inProgress && percentComplete > 0) return "var(--rex)";
    return null;
  };

  // set display number to what was provided by maestro. If nothing was provided, use the iterative number from parent component
  const displayNumber = maestroActivityProperties[sequenceItem.uuid]?.number || activityNumber;
  const displayNumberIsNumeric = !isNaN(Number(displayNumber));

  const stationIcon = <EmojiRenderer iconValue={sequenceItem.icon ? sequenceItem.icon : "2754"} />;

  return (
    <div ref={activityRef} className={styles.activityIndicator}>
      <div
        className={styles.evBox}
        style={{ backgroundColor: crewBackgroundColor(ev1PercentComplete) }}
        data-testid={`activity-ev1-${sequenceItem.uuid}`}
      >
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
          {!crewComplete(ev1PercentComplete) && (
            <div
              className={styles.progressIndicator}
              style={{ height: `${ev1PercentComplete}%` }}
            ></div>
          )}
        </div>
      </div>
      <div
        className={styles.evBox}
        style={{ backgroundColor: crewBackgroundColor(ev2PercentComplete) }}
        data-testid={`activity-ev2-${sequenceItem.uuid}`}
      >
        <div className={styles.evBoxColorLine} style={{ backgroundColor: boxColor }}></div>
        <div className={styles.evBoxMain}>
          <div className={styles.activityNumber}>{displayNumber}</div>
          {sequenceItem.type === "station" && (
            <div className={styles.stationIcon}>{stationIcon}</div>
          )}
          {!crewComplete(ev2PercentComplete) && (
            <div
              className={styles.progressIndicator}
              style={{ height: `${ev2PercentComplete}%` }}
            ></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Activities;

import { FunctionComponent } from "react";
import { hhmmFromMinutes, secondsFromhhmmss } from "utils/formatting";
import styles from "./timeLabels.module.css";

type TimeLabel = {
  minutes: number;
  yLocation: number;
};

const TimeLabels: FunctionComponent<{
  timelineDurationMins: number;
  pixelsPerSecondY: number;
  rexPetTime: string;
}> = ({ timelineDurationMins, pixelsPerSecondY, rexPetTime }) => {
  // make an array of times that will be displayed as the time scale. 0:00, 0:30, 1:00, etc.
  // the last value is the closest 30 minute increment larger than the eva length
  // include the yLocation of each time label
  const timeLabels: TimeLabel[] = [];
  for (let i = 0; i <= timelineDurationMins; i += 30) {
    timeLabels.push({
      minutes: i,
      yLocation: i * 60 * pixelsPerSecondY,
    });
  }

  return (
    <div className={styles.timeLabels}>
      {timeLabels.map((timeLabel) => {
        const petTimeMinutes = secondsFromhhmmss(rexPetTime) / 60;
        return (
          <TimeLabelDisplay
            key={timeLabel.minutes}
            timeLabel={timeLabel}
            completed={timeLabel.minutes < petTimeMinutes}
          />
        );
      })}
    </div>
  );
};

const TimeLabelDisplay: FunctionComponent<{ timeLabel: TimeLabel; completed: boolean }> = ({
  timeLabel,
  completed,
}) => {
  return (
    <div
      className={styles.timeLabel}
      style={{
        top: `${timeLabel.yLocation}px`,
        filter: completed ? "opacity(0.4)" : "opacity(1)",
      }}
    >
      <div className={styles.timeLabelText}>{hhmmFromMinutes(timeLabel.minutes)}-</div>
    </div>
  );
};

export default TimeLabels;
export type { TimeLabel };

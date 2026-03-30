import type { FunctionComponent } from "react";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import { secondsFromhhmmss } from "utils/formatting";
import PetInterval from "components/page/petInterval";
import styles from "./timelineMarker.module.css";

export const PetTimeLine: FunctionComponent<{
  pixelsPerSecondY: number;
  rexPetTime: string;
  setRexPetTime: (time: string) => void;
}> = ({ pixelsPerSecondY, rexPetTime, setRexPetTime }) => {
  const runningRex = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    shallowEqual
  );

  const styleFilter =
    !runningRex || secondsFromhhmmss(rexPetTime) % 2 === 0 ? "opacity(1)" : "opacity(0.5)";

  const petTimeSeconds = secondsFromhhmmss(rexPetTime);

  return (
    <>
      <PetInterval runningRex={runningRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <TimelineMarker
        pixelsPerSecondY={pixelsPerSecondY}
        seconds={petTimeSeconds}
        markerLineStyle={{
          borderTop: `5px solid red`,
        }}
        filter={styleFilter}
      />
    </>
  );
};

export const EVAMaxTimeline: FunctionComponent<{
  pixelsPerSecondY: number;
  duration: number;
}> = ({ pixelsPerSecondY, duration }) => {
  return (
    <TimelineMarker
      pixelsPerSecondY={pixelsPerSecondY}
      seconds={duration * 60}
      markerLineStyle={{
        borderTop: `5px solid var(--grey3)`,
      }}
      filter="opacity(0.8)"
    />
  );
};

const TimelineMarker: FunctionComponent<{
  pixelsPerSecondY: number;
  seconds: number;
  markerLineStyle?: React.CSSProperties;
  filter?: string;
}> = ({ pixelsPerSecondY, seconds, markerLineStyle, filter }) => {
  if (seconds <= 0) return null;
  return (
    <div className={styles.markerContainer}>
      <div
        className={styles.marker}
        style={{
          top: `${seconds * pixelsPerSecondY}px`,
        }}
      >
        <div
          className={styles.markerLine}
          style={{
            ...markerLineStyle,
            filter: filter,
          }}
        />
      </div>
    </div>
  );
};

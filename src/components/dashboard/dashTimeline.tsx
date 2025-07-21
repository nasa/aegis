import {
  FunctionComponent,
  MutableRefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import { deepEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { processEvaDataFromStore } from "../interface/timeline/common-timeline";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import styles from "./dashTimeline.module.css";
import { decodeEmoji, hhmmFromMinutes, secondsFromhhmmss } from "utils/formatting";
import PetInterval from "components/page/petInterval";
import useWindowSize from "use-window-size-v2";

type TimeLabel = {
  minutes: number;
  yLocation: number;
};

const DashTimeline: FunctionComponent = () => {
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const runningEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb.evaUuid),
    deepEqual
  );
  const missionFromDb = useAppSelector((state) => state.mission.missionFromDb, deepEqual);
  const evaStations = useAppSelector(selectEvaStations(runningEvaFromDb?.uuid), deepEqual);
  const evaTraverses = useAppSelector(selectEvaTraverses(runningEvaFromDb?.uuid), deepEqual);

  const stationCalculatedFieldsInRunningEva = useAppSelector((state) => {
    const stationsInEvaSequence = runningEvaFromDb?.sequence
      ? runningEvaFromDb.sequence.filter((s) => s.type === "station")
      : [];
    const allStationCalculatedFields: StationCalculatedFields[] = [];
    for (const stationSeqItem of stationsInEvaSequence) {
      const station = state.station.stations.find((s) => s.uuid === stationSeqItem.uuid);
      const stationActions = state.action.actions.filter(
        (a) => a.stationUuid === stationSeqItem.uuid && a.enabled
      );
      allStationCalculatedFields.push(
        getCalculatedFieldsByStation({
          station,
          missionWalkbackRate: state.mission.mission.walkbackRate,
          stationActions,
        })
      );
    }
    return allStationCalculatedFields;
  }, deepEqual);
  const traverseCalculatedFieldsInRunningEva = useAppSelector((state) => {
    const traversesInEvaSequence = runningEvaFromDb?.sequence
      ? runningEvaFromDb.sequence.filter((s) => s.type === "traverse")
      : [];
    const allTraverseCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverseSeqItem of traversesInEvaSequence) {
      const traverse = state.traverse.traverses.find(
        (traverse) => traverse.uuid === traverseSeqItem.uuid
      );
      const traverseEva = state.eva.evas.find((eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === traverse.uuid)
      );
      const traverseActions = state.action.actions.filter(
        (a) => a.traverseUuid === traverseSeqItem.uuid && a.enabled
      );
      allTraverseCalculatedFields.push(
        getCalculatedFieldsByTraverse({
          traverse,
          missionTraverseRate: state.mission.mission.traverseRate,
          traverseEva,
          traverseActions,
        })
      );
    }
    return allTraverseCalculatedFields;
  }, deepEqual);

  const storeRef: MutableRefObject<EvaCalculated_PaperJS> = useRef({
    sequenceItems: [],
    selectedEvaSequenceItemUuid: null,
    maxDistFromLanderMeters: 0,
    evaLengthMins: 0,
    evaLengthCalculatedMins: 0,
    maxElevationMeters: 0,
    minElevationMeters: 0,
    landerElevationMeters: 0,
    elevationResolutionMeters: 0,
    egressDurationMins: 0,
    ingressDurationMins: 0,
  });
  const containerRef: MutableRefObject<HTMLDivElement> = useRef(null);
  const [pixelsPerSecondY, setPixelsPerSecondY] = useState(0);
  const [timelineDurationMins, setTimelineDurationMins] = useState(0);
  const [rexPetTime, setRexPetTime] = useState("");

  const { width, height } = useWindowSize();

  // calculate the pixelsPerSecondY and timelineDurationMins when the containerRef, storeRef, selectedEva, or window size changes
  useEffect(() => {
    const heightPixels = containerRef.current?.clientHeight - 40;

    const maxEvaDurationMins = Math.max(
      storeRef.current.evaLengthMins,
      storeRef.current.evaLengthCalculatedMins
    );
    // round up to the nearest 30 minutes
    const timelineDuration = Math.ceil(maxEvaDurationMins / 30) * 30;

    const evaDurationSeconds = timelineDuration * 60;
    const ppsY = heightPixels / evaDurationSeconds;
    setPixelsPerSecondY(ppsY);
    setTimelineDurationMins(timelineDuration);
  }, [
    storeRef,
    containerRef,
    runningEvaFromDb,
    width,
    height,
    evaStations,
    evaTraverses,
    missionFromDb,
  ]);

  // update the storeRef object with the calculated data when anything changes
  useLayoutEffect(() => {
    processEvaDataFromStore({
      storeRef,
      mission: missionFromDb,
      selectedEva: runningEvaFromDb,
      evaStations,
      evaTraverses,
      missionTraverseRate: missionFromDb?.traverseRate,
      missionWalkbackRate: missionFromDb?.walkbackRate,
      stationCalculatedFieldsInSelectedEva: stationCalculatedFieldsInRunningEva,
      traverseCalculatedFieldsInSelectedEva: traverseCalculatedFieldsInRunningEva,
      selectedRex: runningRexFromDb,
    });
  }, [
    storeRef,
    missionFromDb,
    runningEvaFromDb,
    evaStations,
    evaTraverses,
    stationCalculatedFieldsInRunningEva,
    traverseCalculatedFieldsInRunningEva,
    runningRexFromDb,
    pixelsPerSecondY,
    timelineDurationMins,
    width,
    height,
  ]);

  // Move the rex line to the pet time

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
    <div className={styles.container} ref={containerRef}>
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
      <div className={styles.stationTraverseIndicators}>
        {storeRef.current.sequenceItems.map((sequenceItem) => {
          return (
            <Indicator
              key={sequenceItem.uuid}
              sequenceItem={sequenceItem}
              pixelsPerSecondY={pixelsPerSecondY}
              rex={runningRexFromDb}
            />
          );
        })}
      </div>
      <div className={styles.stationNames}>
        {storeRef.current.sequenceItems.map((sequenceItem) => {
          if (sequenceItem.type === "station")
            return (
              <StationName
                key={sequenceItem.uuid}
                sequenceItem={sequenceItem}
                pixelsPerSecondY={pixelsPerSecondY}
                rex={runningRexFromDb}
              />
            );
          return null;
        })}
      </div>
      <EVAMaxTimeline
        pixelsPerSecondY={pixelsPerSecondY}
        evaLengthCalculatedMins={storeRef.current.evaLengthCalculatedMins}
        duration={runningEvaFromDb?.duration}
      />
      <RexTimeline
        pixelsPerSecondY={pixelsPerSecondY}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
    </div>
  );
};

export default DashTimeline;

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
      <div className={styles.timeLabelText}>{hhmmFromMinutes(timeLabel.minutes)} -</div>
    </div>
  );
};

const Indicator: FunctionComponent<{
  sequenceItem: EVASequenceItemForTimeline;
  pixelsPerSecondY: number;
  rex: Rex;
}> = ({ sequenceItem, pixelsPerSecondY, rex }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const radiusHeight = 10;

  let completed = false;
  let inProgress = false;
  if (sequenceItem.type === "station") {
    let entry = null;
    if (sequenceItem.name === "Egress" || sequenceItem.name === "Ingress") {
      entry = rex?.xgressEntries ? rex?.xgressEntries[sequenceItem.uuid] : null;
    } else {
      entry = rex?.stationEntries ? rex?.stationEntries[sequenceItem.uuid] : null;
    }
    completed = entry?.rexStatus === "complete";
    inProgress = entry?.rexStatus === "in-progress";
  } else if (sequenceItem.type === "traverse") {
    // find the last traverseEntry in the rex for this traverse
    const traverseEntry = rex?.traverseEntries ? rex?.traverseEntries[sequenceItem.uuid] : null;
    completed = traverseEntry?.rexStatus === "complete";
    inProgress = traverseEntry?.rexStatus === "in-progress";
  }

  useLayoutEffect(() => {
    if (outerRef.current) {
      outerRef.current.style.top = `${sequenceItem.secondsStart * pixelsPerSecondY + radiusHeight}px`;
    }
    if (innerRef.current) {
      innerRef.current.style.height = `${sequenceItem.totalDurationMins * 60 * pixelsPerSecondY - radiusHeight / 2}px`;
    }
  }, [sequenceItem, pixelsPerSecondY]);

  return (
    <div ref={outerRef} className={styles.stationTraverseIndicator}>
      <div
        ref={innerRef}
        className={
          sequenceItem.type === "station" ? styles.stationIndicator : styles.traverseIndicator
        }
        style={{
          filter: completed ? "opacity(0.4)" : "opacity(1)",
          backgroundColor: sequenceItem.type === "station" && inProgress ? "var(--rex)" : null,
          borderLeft:
            sequenceItem.type === "traverse" && inProgress ? "9px dotted var(--rex)" : null,
        }}
      />
    </div>
  );
};

const StationName: FunctionComponent<{
  sequenceItem: EVASequenceItemForTimeline;
  pixelsPerSecondY: number;
  rex: Rex;
}> = ({ sequenceItem, pixelsPerSecondY, rex }) => {
  const ref = useRef<HTMLDivElement>(null);

  let completed = false;
  let entry = null;
  if (sequenceItem.name === "Egress" || sequenceItem.name === "Ingress") {
    entry = rex?.xgressEntries ? rex?.xgressEntries[sequenceItem.uuid] : null;
  } else {
    entry = rex?.stationEntries ? rex?.stationEntries[sequenceItem.uuid] : null;
  }
  completed = entry?.rexStatus === "complete";

  useLayoutEffect(() => {
    const start = sequenceItem.secondsStart * pixelsPerSecondY;
    const midDuration = (sequenceItem.totalDurationMins / 2) * 60 * pixelsPerSecondY;
    const textHeight = 13;
    if (ref.current) {
      ref.current.style.top = `${start + midDuration - textHeight}px`;
    }
  }, [sequenceItem, pixelsPerSecondY]);

  return (
    <div ref={ref} className={styles.stationName}>
      <span
        className={styles.stationNameText}
        style={{
          filter: completed ? "opacity(0.4)" : "opacity(1)",
        }}
      >
        {decodeEmoji(sequenceItem.icon)} {sequenceItem.name.replace("Station ", "S")}
      </span>
    </div>
  );
};

const RexTimeline: FunctionComponent<{
  pixelsPerSecondY: number;
  rexPetTime: string;
  setRexPetTime: (time: string) => void;
}> = ({ pixelsPerSecondY, rexPetTime, setRexPetTime }) => {
  const runningRex = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    shallowEqual
  );

  const [petTimeYlocation, setPetTimeYLocation] = useState(0);
  const [styleFilter, setStyleFilter] = useState("opacity(1)");

  useEffect(() => {
    if (!runningRex) return;
    const petTimeSeconds = secondsFromhhmmss(rexPetTime);
    setPetTimeYLocation(petTimeSeconds * pixelsPerSecondY);

    if (secondsFromhhmmss(rexPetTime) % 2 === 0) {
      setStyleFilter("opacity(1)");
    } else {
      setStyleFilter("opacity(0.7)");
    }
  }, [runningRex, pixelsPerSecondY, rexPetTime]);

  return (
    <>
      <PetInterval runningRex={runningRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={styles.markerContainer}>
        <div
          className={styles.marker}
          style={{
            top: `${petTimeYlocation}px`,
          }}
        >
          <div
            className={styles.markerLine}
            style={{
              filter: styleFilter,
            }}
          />
          <div className={styles.markerTime}>
            {hhmmFromMinutes(Math.floor(secondsFromhhmmss(rexPetTime) / 60))}
          </div>
        </div>
      </div>
    </>
  );
};

const EVAMaxTimeline: FunctionComponent<{
  pixelsPerSecondY: number;
  evaLengthCalculatedMins: number;
  duration: number;
}> = ({ pixelsPerSecondY, evaLengthCalculatedMins, duration }) => {
  return (
    <div className={styles.markerContainer}>
      <div
        className={styles.marker}
        style={{
          top: `${duration * 60 * pixelsPerSecondY}px`,
        }}
      >
        <div
          className={styles.markerLine}
          style={{
            borderTop:
              duration < evaLengthCalculatedMins
                ? "5px solid var(--warning)"
                : "5px solid var(--grey5)",
          }}
        />
        <div
          className={styles.markerTime}
          style={{
            color: "black",
            backgroundColor: duration < evaLengthCalculatedMins ? "var(--warning)" : "var(--grey5)",
          }}
        >
          {hhmmFromMinutes(duration)}
        </div>
      </div>
    </div>
  );
};

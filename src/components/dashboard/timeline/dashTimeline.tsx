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
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { processEvaDataFromStore } from "../../interface/timeline/common-timeline";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import styles from "./dashTimeline.module.css";
import { PetTimeLine, EVAMaxTimeline } from "./timelineMarker";
import TimeLabels from "./timeLabels";
import useWindowSize from "use-window-size-v2";
import Activities from "./activities";

const DashTimeline: FunctionComponent = () => {
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const runningEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb?.evaUuid),
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
        eva.sequence.some((seqItem) => seqItem.uuid === traverse?.uuid)
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
    const userSetEvaDuration = storeRef.current.evaLengthMins;
    const calculatedEvaDuration = storeRef.current.evaLengthCalculatedMins;

    const heightPixels = containerRef.current?.clientHeight - 40;

    // round up to the nearest 30 minutes
    const timelineDuration =
      Math.ceil(Math.max(userSetEvaDuration, calculatedEvaDuration) / 30) * 30;

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

  return (
    <>
      <div className={styles.container} ref={containerRef}>
        <div className={styles.header}>
          <div className={styles.title}>EV1</div>
          <div className={styles.title}>EV2</div>
        </div>
        <EVAMaxTimeline pixelsPerSecondY={pixelsPerSecondY} duration={runningEvaFromDb?.duration} />
        <PetTimeLine
          pixelsPerSecondY={pixelsPerSecondY}
          rexPetTime={rexPetTime}
          setRexPetTime={setRexPetTime}
        />
        <TimeLabels
          timelineDurationMins={timelineDurationMins}
          pixelsPerSecondY={pixelsPerSecondY}
          rexPetTime={rexPetTime}
        />
        <Activities
          sequenceItems={storeRef.current.sequenceItems}
          pixelsPerSecondY={pixelsPerSecondY}
          rex={runningRexFromDb}
        />
      </div>
    </>
  );
};

export default DashTimeline;

import type { FunctionComponent, MutableRefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import { deepEqual } from "utils/useAppSelector";
import { processEvaDataFromStore } from "../../interface/timeline/common-timeline";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import styles from "./dashTimeline.module.css";
import { PetTimeLine, EVAMaxTimeline } from "./timelineMarker";
import TimeLabels from "./timeLabels";
import useWindowSize from "use-window-size-v2";
import Activities from "./activities";
import { useMissionDocSelector } from "utils/useDocSelector";

const DashTimeline: FunctionComponent = () => {
  const runningRex = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return null;
    return Object.values(mission.rexes).find((r) => r.isRunning) ?? null;
  }, deepEqual);
  const runningEva = useMissionDocSelector((mission) => {
    if (!mission?.evas || !runningRex) return null;
    return mission.evas[runningRex.evaUuid] ?? null;
  }, deepEqual);
  const partialMission = useMissionDocSelector(
    (mission) => ({
      walkbackRate: mission.walkbackRate,
      traverseRate: mission.traverseRate,
      demResolution: mission.demResolution,
      landerElevationMeters: mission.landerElevationMeters,
      landerLocation: mission.landerLocation,
      planetRadius: mission.planetRadius,
      defaultEvaDuration: mission.defaultEvaDuration,
    }),
    deepEqual
  );

  const evaStations = useMissionDocSelector(
    (mission) => selectEvaStations(mission, runningEva?.uuid),
    deepEqual
  );
  const evaTraverses = useMissionDocSelector(
    (mission) => selectEvaTraverses(mission, runningEva?.uuid),
    deepEqual
  );
  const allActionRecords = useMissionDocSelector((mission) => mission.actions, deepEqual);

  const stationCalculatedFieldsInRunningEva = useMemo(() => {
    const stationsInEvaSequence = runningEva?.sequence
      ? runningEva.sequence.filter((s) => s.type === "station")
      : [];
    const allStationCalculatedFields: StationCalculatedFields[] = [];
    for (const stationSeqItem of stationsInEvaSequence) {
      const station = evaStations.find((s) => s.uuid === stationSeqItem.uuid);
      const stationActions = Object.values(allActionRecords).filter(
        (a) => a.stationUuid === stationSeqItem.uuid && a.enabled
      );
      allStationCalculatedFields.push(
        getCalculatedFieldsByStation({
          station,
          missionWalkbackRate: partialMission.walkbackRate,
          stationActions,
        })
      );
    }
    return allStationCalculatedFields;
  }, [runningEva, evaStations, allActionRecords, partialMission.walkbackRate]);
  const traverseCalculatedFieldsInRunningEva = useMemo(() => {
    const traversesInEvaSequence = runningEva?.sequence
      ? runningEva.sequence.filter((s) => s.type === "traverse")
      : [];
    const allTraverseCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverseSeqItem of traversesInEvaSequence) {
      const traverse = evaTraverses.find((traverse) => traverse.uuid === traverseSeqItem.uuid);
      const traverseEva = runningEva; // traverse is always in the running eva
      const traverseActions = Object.values(allActionRecords).filter(
        (a) => a.traverseUuid === traverseSeqItem.uuid && a.enabled
      );
      allTraverseCalculatedFields.push(
        getCalculatedFieldsByTraverse({
          traverse,
          missionTraverseRate: partialMission.traverseRate,
          evaTraverseRate: traverseEva?.traverseRate,
          traverseActions,
        })
      );
    }
    return allTraverseCalculatedFields;
  }, [runningEva, evaTraverses, allActionRecords, partialMission.traverseRate]);

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
  });
  const containerRef: MutableRefObject<HTMLDivElement> = useRef(null);
  const [pixelsPerSecondY, setPixelsPerSecondY] = useState(0);
  const [timelineDurationMins, setTimelineDurationMins] = useState(0);
  const [rexPetTime, setRexPetTime] = useState("");
  const [sequenceItems, setSequenceItems] = useState<EvaCalculated_PaperJS["sequenceItems"]>([]);

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
    runningEva,
    width,
    height,
    evaStations,
    evaTraverses,
    partialMission,
  ]);

  // update the storeRef object with the calculated data when anything changes
  useLayoutEffect(() => {
    processEvaDataFromStore({
      storeRef,
      partialMission,
      selectedEva: runningEva,
      evaStations,
      evaTraverses,
      stationCalculatedFieldsInSelectedEva: stationCalculatedFieldsInRunningEva,
      traverseCalculatedFieldsInSelectedEva: traverseCalculatedFieldsInRunningEva,
      selectedRex: runningRex,
    });
    setSequenceItems(storeRef.current.sequenceItems);
  }, [
    storeRef,
    partialMission,
    runningEva,
    evaStations,
    evaTraverses,
    stationCalculatedFieldsInRunningEva,
    traverseCalculatedFieldsInRunningEva,
    runningRex,
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
        <EVAMaxTimeline pixelsPerSecondY={pixelsPerSecondY} duration={runningEva?.duration} />
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
          sequenceItems={sequenceItems}
          pixelsPerSecondY={pixelsPerSecondY}
          rex={runningRex}
        />
      </div>
    </>
  );
};

export default DashTimeline;

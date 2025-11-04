import paper from "paper";
import {
  FunctionComponent,
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";

import styles from "./timeline.module.css";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { useAppDispatch } from "utils/useAppDispatch";
import { clearMapItemHover } from "store/hover";
import throttle from "lodash/throttle";
import isNil from "lodash/isNil";
import { STM_Coverage } from "components/panes/stm/stm-coverage";
import * as TimelineDrawing from "./timeline-drawing";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { initGraphItemsRef, initPaperRefs } from "./timeline-init";
import TimelineHoverValues from "./timeline-hover";
import { selectEvaActions, selectEvaStations, selectEvaTraverses } from "store/selectors";
import { setSelectedPosEntryUuid } from "store/rex";
import PetInterval from "../../page/petInterval";
import { getStmUuids } from "store/storeUtils/store";
import {
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import { processEvaDataFromStore } from "./common-timeline";

/**
 * Renders the navigation timeline presented at the bottom of the window
 */
const NavTimeline: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid),
    deepEqual
  );
  const selectedRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid),
    deepEqual
  );
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedPosEntryUuid = useAppSelector((state) => state.rex.selectedPosEntryUuid, refEqual);
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);
  const evaActions = useAppSelector(selectEvaActions(), deepEqual);
  const evaStations = useAppSelector(selectEvaStations(), deepEqual);
  const evaTraverses = useAppSelector(selectEvaTraverses(), deepEqual);
  const runningRex = useAppSelector((state) => state.rex.rexes.find((r) => r.isRunning), deepEqual);
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );

  const stationCalculatedFieldsInSelectedEva = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    const stationsInEvaSequence = eva?.sequence
      ? eva.sequence.filter((s) => s.type === "station")
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
  const traverseCalculatedFieldsInSelectedEva = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid);
    const traversesInEvaSequence = eva?.sequence
      ? eva.sequence.filter((s) => s.type === "traverse")
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
        (a) => a.traverseUuid === traverse?.uuid && a.enabled
      );
      allTraverseCalculatedFields.push(
        getCalculatedFieldsByTraverse({
          traverse,
          missionTraverseRate: state.mission.mission.traverseRate,
          evaTraverseRate: traverseEva?.traverseRate,
          traverseActions,
        })
      );
    }
    return allTraverseCalculatedFields;
  }, deepEqual);

  const showDistanceFromLander = useAppSelector(
    (state) => state.interface.timelineShowDistanceFromLander,
    refEqual
  );
  const showElevation = useAppSelector((state) => state.interface.timelineShowElevation, refEqual);
  const rightPanelIsOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);
  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const paperDataRef: MutableRefObject<PaperData> = useRef(null);
  const storeRef: MutableRefObject<EvaCalculated_PaperJS> = useRef(null);
  const paperGroupsRef: MutableRefObject<PaperGroups> = useRef(null);
  const posRef: MutableRefObject<PosEntry_PaperJS[]> = useRef(null);
  const graphSequenceItems: MutableRefObject<GraphSequenceItems> = useRef(null);
  const flattenedGraphData: MutableRefObject<GraphData> = useRef(null);

  const initHoverValues: TimelineHoverValues = {
    distanceFromLanderMeters: null,
    elevationMeters: null,
    slopeDegrees: null,
    walkbackDistanceFromLanderMeters: null,
    walkbackElevationMeters: null,
    walkbackSlopeDegrees: null,
  };
  const [hoverValues, setHoverValues] = useState<TimelineHoverValues>(initHoverValues);

  //gather stm states
  const completedSTMs: string[][] = [];
  const inProgressSTMs: string[][] = [];
  const coveredSTMs: string[][] = [];

  evaActions?.forEach((action) => {
    if (action.enabled) {
      coveredSTMs.push(getStmUuids(action.stmPriorities));
      if (runningRex?.actionEntries) {
        const rexStatus = runningRex.actionEntries[action.uuid]?.rexStatus;
        if (rexStatus === "complete") {
          completedSTMs.push(getStmUuids(action.stmPriorities));
        } else if (rexStatus === "in-progress") {
          inProgressSTMs.push(getStmUuids(action.stmPriorities));
        }
      }
    }
  });

  // used to update the PET value via the PetInterval component
  const [runningRexPetTime, setRunningRexPetTime] = useState("");

  /**
   * Populate storeRefs with all our store information so paper.js can read it.
   * Perform additional calculations required for drawing, such as subdividing any paths
   */
  const processEvaDataFromStoreCallback = useCallback(() => {
    processEvaDataFromStore({
      storeRef,
      mission,
      selectedEva,
      evaStations,
      evaTraverses,
      missionTraverseRate: mission?.traverseRate,
      missionWalkbackRate: mission?.walkbackRate,
      stationCalculatedFieldsInSelectedEva,
      traverseCalculatedFieldsInSelectedEva,
      selectedRex,
    });
  }, [
    storeRef,
    mission,
    selectedEva,
    evaStations,
    evaTraverses,
    stationCalculatedFieldsInSelectedEva,
    traverseCalculatedFieldsInSelectedEva,
    selectedRex,
  ]);

  /**
   * Populate posRef
   */
  const processPosEntriesFromStore = useCallback(() => {
    if (!mission || !selectedRex) return;
    const posForPaper: PosEntry_PaperJS[] = [];
    for (const posEntry of selectedRex.posEntries || []) {
      const distFromLander = getDistanceBetweenTwoCoordinates(
        mission.landerLocation,
        posEntry.location,
        mission.planetRadius
      );
      posForPaper.push({ ...posEntry, distanceFromLanderMeters: distFromLander });
    }
    posRef.current = posForPaper;
  }, [mission, selectedRex]);

  /**
   * Main function to draw the timeline. All the paper drawing happens here
   */
  const drawTimeline = useCallback(async () => {
    //clear project and initialize paper refs and data for drawing
    paper.project.clear();

    processEvaDataFromStoreCallback(); //loads data into the storeRef
    initPaperRefs(paperDataRef, paperGroupsRef, storeRef);
    initGraphItemsRef(paperDataRef, storeRef, graphSequenceItems, flattenedGraphData);

    //draw the graph axis (even if no EVA is selected)
    TimelineDrawing.drawGraphAxis(paperDataRef, storeRef);
    //draw pet line for selected rex.
    const rexPetTimeToDraw =
      runningRexFromDb?.uuid === selectedRexFromDb?.uuid
        ? runningRexPetTime // draw the ticking time
        : selectedRexFromDb?.petValueAtStartStop; // draw the static time at the start/stop of the rex
    TimelineDrawing.drawPetLine(
      paperDataRef,
      paperGroupsRef,
      rexPetTimeToDraw,
      selectedRexFromDb?.petRunning
    );
    //draw all the things
    if (selectedEva) {
      TimelineDrawing.drawSequenceBottomSection(
        paperDataRef,
        paperGroupsRef,
        storeRef,
        selectedEvaSequenceItemUuid
      );
      if (showDistanceFromLander) {
        TimelineDrawing.drawLanderDistanceGraph(paperDataRef, graphSequenceItems);
      }
      if (showElevation && storeRef.current.landerElevationMeters) {
        TimelineDrawing.drawElevationProfile(paperDataRef, graphSequenceItems);
      }
      TimelineDrawing.drawWalkbacks(paperDataRef, graphSequenceItems, selectedEvaSequenceItemUuid);
      TimelineDrawing.drawWalkbackElevations(
        paperDataRef,
        graphSequenceItems,
        selectedEvaSequenceItemUuid
      );
    }

    // only draw crew pos if the eva we've selected matches the rex's eva
    if (selectedRex && selectedEva?.uuid === selectedRex.evaUuid) {
      processPosEntriesFromStore();
      TimelineDrawing.drawPositionMarkers(
        paperDataRef,
        paperGroupsRef,
        posRef,
        selectedPosEntryUuid
      );
    }
    // do not include rexPetTime in the dependencies array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedEva,
    selectedRex,
    selectedRexFromDb,
    selectedEvaSequenceItemUuid,
    showDistanceFromLander,
    showElevation,
    graphSequenceItems,
    selectedPosEntryUuid,
    rightPanelIsOpen,
    runningRexPetTime,
    processEvaDataFromStoreCallback, //this will trigger if the storeRef changes
    processPosEntriesFromStore, //this will trigger if the posRef changes
  ]);

  //handle pet rex seconds moving during rex and blink
  useEffect(() => {
    if (!runningRexPetTime || !paperGroupsRef?.current?.petLine?.firstChild) return;

    TimelineDrawing.drawPetLine(
      paperDataRef,
      paperGroupsRef,
      runningRexPetTime,
      selectedRexFromDb?.petRunning
    );
  }, [runningRexPetTime, paperGroupsRef?.current?.petLine, selectedRexFromDb]);

  //redraw entire timeline
  useEffect(() => {
    if (storeRef?.current)
      storeRef.current.selectedEvaSequenceItemUuid = selectedEvaSequenceItemUuid;
    drawTimeline();
  }, [
    // draw timeline also has a lot of dependencies that will also trigger a redraw
    // since drawTimeline is a dependency listed here
    drawTimeline,
    selectedEvaSequenceItemUuid,
  ]);

  /**
   * Event listeners for the paper canvas with state dependencies
   */
  useEffect(() => {
    const onMouseMove = (event: paper.MouseEvent) => {
      //handles on mouse move over the paper canvas
      TimelineDrawing.drawMouseHover(
        dispatch,
        paperDataRef,
        paperGroupsRef,
        storeRef,
        flattenedGraphData,
        event.point,
        setHoverValues,
        mission?.landerElevationMeters
      );
    };
    paper.view.onMouseMove = throttle(onMouseMove, 15, {
      leading: true,
      trailing: false,
    });
  }, [dispatch, mission?.landerElevationMeters]);
  useEffect(() => {
    paper.view.onResize = function () {
      drawTimeline();
    };
  }, [drawTimeline]);

  // Initialize the timeline canvas and project on first render
  useLayoutEffect(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }

    // the event listeners that don't require any dependencies can be defined here
    paper.view.onMouseLeave = () => {
      paperGroupsRef.current.hoverLine.visible = false;
      dispatch(clearMapItemHover());

      //clear hover values
      setHoverValues(initHoverValues);
    };
    paper.view.onClick = function (event: paper.MouseEvent) {
      //handle click on crew pos
      let selectedPosEntryUuid: string = null;
      for (const posDrawing of paperGroupsRef.current.positionMarkers.children) {
        if (posDrawing.contains(new paper.Point(event.point.x, event.point.y))) {
          selectedPosEntryUuid = posDrawing.name;
          break;
        }
      }
      if (selectedPosEntryUuid) {
        dispatch(setSelectedPosEntryUuid(selectedPosEntryUuid));
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
        return;
      }

      // handle click on sequence item
      //determine what sequence item the x coordinate is in
      let sequenceUuid: string = null;
      for (const bkgBlock of paperGroupsRef.current.graphBkg.children) {
        if (
          bkgBlock.contains(
            new paper.Point(event.point.x, paperDataRef.current.paperVars.timelineTop + 1)
          )
        ) {
          //add 1 so the y point would be inside the block
          sequenceUuid = bkgBlock.name;
          break;
        }
      }
      //set selected uuid if we have one
      if (sequenceUuid && sequenceUuid !== "egress" && sequenceUuid !== "ingress") {
        dispatch(setSelectedPosEntryUuid(null));
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: sequenceUuid }));
        return;
      }
    };

    return () => paper.project.remove();
    // do not include initHoverValues in the dependencies array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPanelIsOpen]);

  // populated the flattenedGraphData ref walkback data based on the selected station
  useEffect(() => {
    if (!flattenedGraphData?.current) return;
    if (selectedEvaSequenceItemUuid) {
      if (!graphSequenceItems || !graphSequenceItems.current[selectedEvaSequenceItemUuid]) return;
      flattenedGraphData.current.walkbackDistanceFromLanderXY =
        graphSequenceItems.current[selectedEvaSequenceItemUuid].walkbackDistanceFromLanderXY;
      flattenedGraphData.current.walkbackElevationXY =
        graphSequenceItems.current[selectedEvaSequenceItemUuid].walkbackElevationXY;
    } else {
      flattenedGraphData.current.walkbackDistanceFromLanderXY = [];
      flattenedGraphData.current.walkbackElevationXY = [];
    }
  }, [selectedEvaSequenceItemUuid, graphSequenceItems, flattenedGraphData]);

  return (
    <div className={styles.timelineContainer}>
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={runningRexPetTime}
        setRexPetTime={setRunningRexPetTime}
      />
      <TimelineHoverValues hoverValues={hoverValues} />
      <div className={styles.canvasContainer}>
        <div className={styles.timelineBodyItem}>
          <canvas ref={canvas} data-paper-resize />
        </div>
      </div>
      {actionSystemVersion === 1 && (
        <div className={styles.timelineRight}>
          <STM_Coverage
            stmUuidsByActionUuid={coveredSTMs}
            horizontal={false}
            completedStmUuidsByAction={completedSTMs}
            inProgressStmUuidsByAction={inProgressSTMs}
          />
        </div>
      )}
    </div>
  );
};

export default NavTimeline;

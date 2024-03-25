import isNil from "lodash/isNil";
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
import { addPointsAtMeters, getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { useAppDispatch } from "utils/useAppDispatch";

import { clearMapItemHover } from "store/hover";
import _ from "lodash";
import { STM_Coverage } from "components/panes/stm/stm-coverage";
import * as TimelineDrawing from "./timeline-drawing";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { initGraphItemsRef, initPaperRefs } from "./timeline-init";
import TimelineHoverValues from "./timeline-hover";
import { selectedEvaActions, selectedEvaStations, selectedEvaTraverses } from "store/selectors";
import { secondsFromhhmmss } from "utils/formatting";
import { setSelectedPosEntryUuid } from "store/rex";
import PetInterval from "../page/petInterval";

/**
 * Renders the navigation timeline presented at the bottom of the window
 */
const NavTimeline: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid),
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
  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseRate,
    refEqual
  );
  const evaTraverseRate = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid)?.traverseRate,
    refEqual
  );
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);
  const evaActions = useAppSelector(selectedEvaActions(), deepEqual);
  const evaStations = useAppSelector(selectedEvaStations(), deepEqual);
  const evaTraverses = useAppSelector(selectedEvaTraverses(), deepEqual);
  const runningRex = useAppSelector((state) => state.rex.rexes.find((r) => r.isRunning), deepEqual);
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const stationCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    deepEqual
  );

  const showDistanceFromLander = useAppSelector(
    (state) => state.interface.timelineShowDistanceFromLander,
    refEqual
  );
  const showElevation = useAppSelector((state) => state.interface.timelineShowElevation, refEqual);
  const rightPanelIsOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);

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
  const [coveredSTMs, setCoveredSTMs] = useState<string[][]>(null);
  const [completedSTMs, setCompletedSTMs] = useState<string[][]>(null);
  const [inProgressSTMs, setInProgressSTMs] = useState<string[][]>(null);

  //gather stm states
  useEffect(() => {
    if (!evaActions) return;
    const newCompletedSTMs: string[][] = [];
    const newInProgressSTMs: string[][] = [];
    const newCoveredSTMs: string[][] = [];

    evaActions.forEach((action) => {
      if (action.enabled) {
        newCoveredSTMs.push(action.stmUuidRefs);
        if (runningRex?.actionEntries) {
          const rexStatus = _.last(runningRex.actionEntries[action.uuid])?.rexStatus;
          if (rexStatus === "complete") {
            newCompletedSTMs.push(action.stmUuidRefs);
          } else if (rexStatus === "in-progress") {
            newInProgressSTMs.push(action.stmUuidRefs);
          }
        }
      }
    });

    setCoveredSTMs(newCoveredSTMs);
    setCompletedSTMs(newCompletedSTMs);
    setInProgressSTMs(newInProgressSTMs);
  }, [evaActions, selectedEva, runningRex]);

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  /**
   * Populate storeRefs with all our store information so paper.js can read it.
   * Perform additional calculations required for drawing, such as subdividing any paths
   */
  const processEvaDataFromStore = useCallback(() => {
    storeRef.current = {
      sequenceItems: [],
      selectedEvaSequenceItemUuid: null,
      maxDistFromLanderMeters: 0,
      evaLengthMins: selectedEva?.maxDuration
        ? +selectedEva?.maxDuration
        : +mission?.defaultEvaDuration,
      evaLengthCalculatedMins: 0,
      maxElevationMeters: null,
      minElevationMeters: null,
      landerElevationMeters: null,
      elevationResolutionMeters: null,
      egressDurationMins: null,
      ingressDurationMins: null,
    };

    if (!selectedEva?.sequence || !mission) return;
    storeRef.current.elevationResolutionMeters = mission.demResolution;
    storeRef.current.landerElevationMeters = mission.landerElevationMeters;

    //add fake sequence items for egress and ingress
    const egressSequenceItem: EvaSequenceItem = {
      uuid: "egress",
      type: "station",
    };
    const ingressSequenceItem: EvaSequenceItem = {
      uuid: "ingress",
      type: "station",
    };

    //add egress and ingress to the sequence
    const sequenceWithLander = [egressSequenceItem, ...selectedEva.sequence, ingressSequenceItem];

    //loop through sequence items
    for (const sequenceItem of sequenceWithLander) {
      const sequenceItemForPaperJS: EvaSequenceItem_PaperJS = {
        ...sequenceItem,
        name: null,
        secondsStart: storeRef.current.evaLengthCalculatedMins * 60,
        totalDurationMins: null,
        traverseRateMSec: null,
      };

      //get station or traverse
      if (sequenceItem.type === "station") {
        // special case if the station is egress or ingress inserted into the sequence above
        if (sequenceItem.uuid === "egress") {
          sequenceItemForPaperJS.name = "Egress";
          sequenceItemForPaperJS.totalDurationMins = selectedEva.egressDuration;
          storeRef.current.egressDurationMins = selectedEva.egressDuration;
          storeRef.current.evaLengthCalculatedMins += selectedEva.egressDuration; //add to sum for total length calculated
          sequenceItemForPaperJS.stationElevation = mission.landerElevationMeters;
          sequenceItemForPaperJS.stationDistFromLanderMeters = 0;
          sequenceItemForPaperJS.stationWalkback = null;
        } else if (sequenceItem.uuid === "ingress") {
          sequenceItemForPaperJS.name = "Ingress";
          sequenceItemForPaperJS.totalDurationMins = selectedEva.ingressDuration;
          storeRef.current.ingressDurationMins = selectedEva.ingressDuration;
          storeRef.current.evaLengthCalculatedMins += selectedEva.ingressDuration; //add to sum for total length calculated
          sequenceItemForPaperJS.stationElevation = mission.landerElevationMeters;
          sequenceItemForPaperJS.stationDistFromLanderMeters = 0;
          sequenceItemForPaperJS.stationWalkback = null;
        } else {
          const station = evaStations.find((s) => s?.uuid === sequenceItem.uuid);
          if (!station) continue; //skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)

          sequenceItemForPaperJS.name = station.name;
          sequenceItemForPaperJS.stationElevation = station.elevation ? station.elevation : null;

          //get traverse rate for this sequence item in meters per second (eva rate falling back to mission rate)
          const traverseRate = _.isNumber(evaTraverseRate) ? evaTraverseRate : missionTraverseRate;
          sequenceItemForPaperJS.traverseRateMSec = traverseRate * (1000 / 3600); //convert to m/sec

          // get calculatedFieldValues for this station
          const calculatedFields = stationCalculatedFields.find(
            (calculated) => calculated.uuid === station.uuid
          );

          //calculate duration from actions assigned to station
          // note: this is the "dwell time" which is crew member time spent at the station that is the longest
          const durationMinutes = calculatedFields?.totalDwellTime.durationUpper;

          sequenceItemForPaperJS.totalDurationMins = durationMinutes;
          storeRef.current.evaLengthCalculatedMins += durationMinutes; //add to sum for total length calculated

          if (mission.landerLocation) {
            //calculate distance to lander
            const landerDistance = getDistanceBetweenTwoCoordinates(
              station.location,
              mission.landerLocation,
              mission.planetRadius
            );

            if (landerDistance > storeRef.current.maxDistFromLanderMeters)
              storeRef.current.maxDistFromLanderMeters = landerDistance;
            sequenceItemForPaperJS.stationDistFromLanderMeters = landerDistance;

            //calculate walkback path if this station has a walkback
            if (station.walkbackPath) {
              const walkback: Path_PaperJS = {
                subdividedPath: null,
                subdividedDistMeters: [],
                subdividedDurationsMins: [],
                subdividedDistFromLanderMeters: [],
                segmentedElevationMeters: station.walkbackPathSegmentElevations,
                segmentedDistancesMeters: station.walkbackPathSegmentDistances,
              };

              //find max/min of elevation
              if (station.walkbackPathSegmentElevations) {
                for (const elevationSegment of station.walkbackPathSegmentElevations) {
                  for (const elevation of elevationSegment) {
                    if (
                      !storeRef.current.maxElevationMeters ||
                      storeRef.current.maxElevationMeters < elevation
                    ) {
                      storeRef.current.maxElevationMeters = elevation;
                    }
                    if (
                      !storeRef.current.minElevationMeters ||
                      storeRef.current.minElevationMeters > elevation
                    ) {
                      storeRef.current.minElevationMeters = elevation;
                    }
                  }
                }
              }

              // subdivide each segment by 150 meters for greater accuracy

              const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
                station.walkbackPath,
                150,
                mission.planetRadius
              );
              walkback.subdividedPath = newWalkbackPath;

              //loop through new subdivided walkback path
              for (let i = 0; i < newWalkbackPath.length; i++) {
                //calculate distance from lander. Track max distance
                const landerDistance = getDistanceBetweenTwoCoordinates(
                  newWalkbackPath[i],
                  mission.landerLocation,
                  mission.planetRadius
                );

                if (landerDistance > storeRef.current.maxDistFromLanderMeters)
                  storeRef.current.maxDistFromLanderMeters = landerDistance;
                walkback.subdividedDistFromLanderMeters.push(landerDistance);

                //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
                if (i !== newWalkbackPath.length - 1) {
                  const distanceSegment = getDistanceBetweenTwoCoordinates(
                    newWalkbackPath[i],
                    newWalkbackPath[i + 1],
                    mission.planetRadius
                  );
                  walkback.subdividedDistMeters.push(distanceSegment);
                  const traverseRate = _.isNumber(evaTraverseRate)
                    ? evaTraverseRate
                    : missionTraverseRate;

                  const duration = isNaN(traverseRate)
                    ? 0
                    : (distanceSegment / (+traverseRate * 1000)) * 60;
                  walkback.subdividedDurationsMins.push(duration);
                }
              }

              //set walkback data
              sequenceItemForPaperJS.stationWalkback = walkback;
            }
          }
        }
      } else if (sequenceItem.type === "traverse") {
        const traverse = evaTraverses.find((t) => t.uuid === sequenceItem.uuid);

        if (!traverse || traverse?.path?.length < 2) continue; //skip traverses with less than 2 points
        sequenceItemForPaperJS.name = traverse.name;
        sequenceItemForPaperJS.traverse = {
          subdividedPath: null,
          subdividedDistMeters: [],
          subdividedDistFromLanderMeters: [],
          segmentedDistancesMeters: traverse.pathSegmentDistances,
          segmentedElevationMeters: traverse.pathSegmentElevations,
        };

        //set the traverse rate for the sequence item in meters per second
        //(traverse field value, falling back to eva rate, falling back to mission rate)
        const traverseRate = traverse.traverseRate || evaTraverseRate || missionTraverseRate;
        sequenceItemForPaperJS.traverseRateMSec = traverseRate * (1000 / 3600);

        //find max/min of elevation
        if (traverse.pathSegmentElevations) {
          for (const elevationSegment of traverse.pathSegmentElevations) {
            for (const elevation of elevationSegment) {
              if (
                !storeRef.current.maxElevationMeters ||
                storeRef.current.maxElevationMeters < elevation
              ) {
                storeRef.current.maxElevationMeters = elevation;
              }
              if (
                !storeRef.current.minElevationMeters ||
                storeRef.current.minElevationMeters > elevation
              ) {
                storeRef.current.minElevationMeters = elevation;
              }
            }
          }
        }

        //subdivide seach traverse segment by 150 meters for greater accuracy
        const newTraverse: AEGISPoint[] = addPointsAtMeters(
          traverse.path,
          150,
          mission.planetRadius
        );
        sequenceItemForPaperJS.traverse.subdividedPath = newTraverse;

        sequenceItemForPaperJS.totalDurationMins = 0;
        //loop through new subdivided traverse
        for (let i = 0; i < newTraverse.length; i++) {
          if (mission.landerLocation) {
            //calculate distance from lander. Track max distance
            const landerDistance = getDistanceBetweenTwoCoordinates(
              newTraverse[i],
              mission.landerLocation,
              mission.planetRadius
            );
            if (landerDistance > storeRef.current.maxDistFromLanderMeters)
              storeRef.current.maxDistFromLanderMeters = landerDistance;
            sequenceItemForPaperJS.traverse.subdividedDistFromLanderMeters.push(landerDistance);
          }

          //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
          if (i !== newTraverse.length - 1) {
            const distanceSegment = getDistanceBetweenTwoCoordinates(
              newTraverse[i],
              newTraverse[i + 1],
              mission.planetRadius
            );
            sequenceItemForPaperJS.traverse.subdividedDistMeters.push(distanceSegment);
            const duration = isNaN(traverseRate)
              ? 0
              : (distanceSegment / (+traverseRate * 1000)) * 60;
            sequenceItemForPaperJS.totalDurationMins += duration;
            storeRef.current.evaLengthCalculatedMins += duration; //add to sum for total length calculated
          }
        }
      }
      storeRef.current.sequenceItems.push(sequenceItemForPaperJS);
    }

    //loop through any crew positions (for rex) to check max graph ranges
    if (!selectedRex?.posEntries) return;
    for (const posEntry of selectedRex.posEntries) {
      if (!posEntry.location) continue; //new crew pos don't have location yet
      const newDistance = +getDistanceBetweenTwoCoordinates(
        posEntry.location,
        mission.landerLocation,
        mission.planetRadius
      ).toFixed(2);
      if (newDistance > storeRef.current.maxDistFromLanderMeters)
        storeRef.current.maxDistFromLanderMeters = newDistance;
    }
  }, [
    selectedRex,
    selectedEva,
    evaTraverseRate,
    mission,
    missionTraverseRate,
    evaStations,
    evaTraverses,
    stationCalculatedFields,
  ]);

  const processPosEntriesFromStore = useCallback(() => {
    if (!mission || !selectedRex) return;
    const posForPaper: PosEntry_PaperJS[] = [];
    for (const posEntry of selectedRex.posEntries) {
      const distFromLander = getDistanceBetweenTwoCoordinates(
        mission.landerLocation,
        posEntry.location,
        mission.planetRadius
      );
      posForPaper.push({ ...posEntry, distanceFromLanderMeters: distFromLander });
    }
    posRef.current = posForPaper;
  }, [mission, selectedRex]);

  //handles on mouse move over the paper canvas
  const onMouseMove = (event: paper.MouseEvent) => {
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

  /**
   * Main function to draw the timeline. All the paper drawing happens here
   */
  const drawTimeline = useCallback(() => {
    //clear project and initilize paper refs
    paper.project.clear();

    initPaperRefs(paperDataRef, paperGroupsRef, storeRef);
    initGraphItemsRef(paperDataRef, storeRef, graphSequenceItems, flattenedGraphData);

    //draw just the graph axis if no EVA is selected
    TimelineDrawing.drawGraphAxis(paperDataRef, storeRef);
    //TODO: check if we need this after rex seconds is moving (also exhaustive deps below)
    TimelineDrawing.drawPetLine(paperDataRef, paperGroupsRef, secondsFromhhmmss(rexPetTime));

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
      if (showElevation) {
        TimelineDrawing.drawElevationProfile(paperDataRef, graphSequenceItems);
      }
      TimelineDrawing.drawWalkbacks(paperDataRef, graphSequenceItems, selectedEvaSequenceItemUuid);
      TimelineDrawing.drawWalkbackElevations(
        paperDataRef,
        graphSequenceItems,
        selectedEvaSequenceItemUuid
      );
    }

    if (selectedRex) {
      TimelineDrawing.drawPositionMarkers(
        paperDataRef,
        paperGroupsRef,
        posRef,
        selectedPosEntryUuid
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedEva,
    selectedRex,
    selectedEvaSequenceItemUuid,
    showDistanceFromLander,
    showElevation,
    graphSequenceItems,
    selectedPosEntryUuid,
  ]);

  //handle pet rex seconds moving during rex
  useEffect(() => {
    if (!rexPetTime) return;
    TimelineDrawing.drawPetLine(paperDataRef, paperGroupsRef, secondsFromhhmmss(rexPetTime));
  }, [rexPetTime]);

  //handle pet blink
  useEffect(() => {
    if (!rexPetTime || !paperGroupsRef?.current?.petLine?.firstChild) return;
    const oldPetLine = paperGroupsRef.current.petLine.firstChild as paper.Path.Line;
    if (secondsFromhhmmss(rexPetTime) % 2 === 0) {
      oldPetLine.strokeWidth = 2;
    } else {
      oldPetLine.strokeWidth = 1;
    }
  }, [rexPetTime, paperGroupsRef?.current?.petLine]);

  //use effect to handle color highlighting when selected sequence item changes
  useEffect(() => {
    storeRef.current.selectedEvaSequenceItemUuid = selectedEvaSequenceItemUuid;
    drawTimeline(); //redraw entire timeline
  }, [drawTimeline, storeRef, selectedEvaSequenceItemUuid]);

  // Initialize the timeline on first render
  useLayoutEffect(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }
    if (selectedRex?.posEntries) {
      processPosEntriesFromStore();
    }
    processEvaDataFromStore(); //loads data into the storeRef

    paper.view.onMouseMove = _.throttle(onMouseMove, 15, {
      leading: true,
      trailing: false,
    });

    paper.view.onMouseLeave = () => {
      paperGroupsRef.current.hoverLine.visible = false;
      dispatch(clearMapItemHover());

      //clear hover values
      setHoverValues(initHoverValues);
    };
    paper.view.onResize = function () {
      drawTimeline();
    };
    paper.view.onClick = function (event: paper.MouseEvent) {
      //first check crew pos
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

    drawTimeline();

    return () => paper.project.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedEva,
    processEvaDataFromStore,
    storeRef,
    dispatch,
    setHoverValues,
    selectedEvaSequenceItemUuid,
    showDistanceFromLander,
    showElevation,
    rightPanelIsOpen,
  ]);

  // populated the flattenedGraphData ref walkback data based on the selected station
  useEffect(() => {
    if (!flattenedGraphData) return;
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
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <TimelineHoverValues hoverValues={hoverValues} />
      <div className={styles.canvasContainer}>
        <div className={styles.timelineBodyItem}>
          <canvas ref={canvas} data-paper-resize />
        </div>
      </div>
      <div className={styles.timelineRight}>
        <STM_Coverage
          stmUuidRefs={coveredSTMs}
          mini={true}
          horizontal={false}
          stmUuidRefsCompleted={completedSTMs}
          stmUuidRefsInProgress={inProgressSTMs}
        />
      </div>
    </div>
  );
};

export default NavTimeline;

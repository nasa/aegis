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
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";

import styles from "./timeline.module.css";
import { addPointsAtMeters, getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { useDispatch } from "react-redux";
import { clearMapItemHover } from "store/playheadHover";
import _ from "lodash";
import { STM_Coverage } from "components/panes/stm-coverage";
import * as TimelineDrawing from "./timeline-drawing";
import { Button } from "components/interface/form/globalFields";
import { faChartArea, faChartLine } from "@fortawesome/free-solid-svg-icons";
import { setShowDistanceFromLander, setShowElevation } from "store/interface";
import { selectEVASequenceItem } from "store/cross-slice";
import { initGraphItemsRef, initPaperRefs } from "./timeline-init";

const TimelineHoverValues: FunctionComponent<{ hoverValues: HoverValues }> = ({ hoverValues }) => {
  const dispatch = useDispatch();
  const showDistanceFromLander = useAppSelector(
    (state) => state.interface.timelineShowDistanceFromLander,
    refEqual
  );
  const showElevation = useAppSelector((state) => state.interface.timelineShowElevation, refEqual);

  const distanceFromLanderSelectedColor = showDistanceFromLander ? "#93AFD790" : "var(--grey3)";
  const elevationSelectedColor = showElevation ? "#8fae9590" : "var(--grey3)";

  return (
    <div className={styles.timelineHoverContainer}>
      <div className={styles.timelineOptions}>
        <Button
          icon={faChartLine}
          onClick={() => {
            dispatch(setShowDistanceFromLander(!showDistanceFromLander));
          }}
          toolTip="Show Distance From Lander"
          style={{
            backgroundColor: distanceFromLanderSelectedColor,
            width: "30px",
            fontSize: "1em",
            paddingLeft: "10px",
          }}
        />
        <Button
          icon={faChartArea}
          onClick={() => {
            dispatch(setShowElevation(!showElevation));
          }}
          toolTip="Show Elevation"
          style={{
            backgroundColor: elevationSelectedColor,
            width: "30px",
            fontSize: "1em",
            paddingLeft: "10px",
          }}
        />
      </div>
      <div className={styles.timelineHoverValues}>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Lander Distance</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.distanceFromLanderMeters?.toFixed(2)}{" "}
            {hoverValues.distanceFromLanderMeters ? "m" : "\u00A0"}
          </div>
        </div>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Relative Elevation</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.elevationMeters?.toFixed(2)}
            {hoverValues.elevationMeters ? " m" : "\u00A0"}
          </div>
        </div>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Walkback Lander Dist</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.walkbackDistanceFromLanderMeters?.toFixed(2)}
            {hoverValues.walkbackDistanceFromLanderMeters ? " m" : "\u00A0"}
          </div>
        </div>
        <div className={styles.timelineHoverValueItem}>
          <div className={styles.timelineHoverValueTitle}>Walkback Elevation</div>
          <div className={styles.timelineHoverValue}>
            {hoverValues.walkbackElevationMeters?.toFixed(2)}
            {hoverValues.walkbackElevationMeters ? " m" : "\u00A0"}
          </div>
        </div>
      </div>
      <div className={styles.timelineKey}>
        <div className={styles.timelineKeyItem}>
          <div className={styles.timelineKeyName}>Traverse</div>
          <div className={styles.timelinKeySymbols}>
            <div className={styles.line} style={{ borderColor: "#93AFD7" }}></div>
            <div className={styles.line} style={{ borderColor: "#8fae95" }}></div>
          </div>
        </div>
        <div className={styles.timelineKeyItem}>
          <div className={styles.timelineKeyName}>Walkback</div>
          <div className={styles.timelinKeySvgSymbols}>
            <div className={styles.svgLine}>
              <svg>
                <line
                  x1="0"
                  y1="5"
                  x2="20"
                  y2="5"
                  stroke="#93AFD7"
                  strokeWidth="2"
                  strokeDasharray="5 2"
                />
              </svg>
            </div>
            <div className={styles.svgLine}>
              <svg>
                <line
                  x1="0"
                  y1="5"
                  x2="20"
                  y2="5"
                  stroke="#8fae95"
                  strokeWidth="2"
                  strokeDasharray="5 2"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Renders the navigation timeline presented at the bottom of the window
 */
const NavTimeline: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    shallowEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseSpeed,
    refEqual
  );
  const evaTraverseRate = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid)?.traverseRate,
    refEqual
  );
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);

  const showDistanceFromLander = useAppSelector(
    (state) => state.interface.timelineShowDistanceFromLander,
    refEqual
  );
  const showElevation = useAppSelector((state) => state.interface.timelineShowElevation, refEqual);

  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const paperDataRef: MutableRefObject<PaperData> = useRef(null);
  const storeRef: MutableRefObject<EvaCalculated_PaperJS> = useRef(null);
  const paperGroupsRef: MutableRefObject<PaperGroups> = useRef(null);
  const graphSequenceItems: MutableRefObject<GraphSequenceItems> = useRef(null);
  const flattenedGraphData: MutableRefObject<GraphData> = useRef({
    distanceFromLanderXY: [],
    elevationXY: [],
    walkbackDistanceFromLanderXY: [],
    walkbackElevationXY: [],
  });

  const initHoverValues: HoverValues = {
    distanceFromLanderMeters: null,
    elevationMeters: null,
    slopeDegrees: null,
    walkbackDistanceFromLanderMeters: null,
    walkbackElevationMeters: null,
    walkbackSlopeDegrees: null,
  };
  const [hoverValues, setHoverValues] = useState<HoverValues>(initHoverValues);

  /**
   * Populate storeRefs with all our store information so paper.js can read it.
   * Perform additional calculations required for drawing, such as subdividing any paths
   */
  const processDataFromStore = useCallback(() => {
    storeRef.current = {
      sequenceItems: [],
      selectedEvaSequenceItemUuid: null,
      maxDistFromLanderMeters: 0,
      evaLengthMins: selectedEva?.maxDuration
        ? +selectedEva?.maxDuration
        : +mission.defaultEvaDuration,
      evaLengthCalculatedMins: 0,
      maxElevationMeters: null,
      minElevationMeters: null,
      landerElevationMeters: null,
      elevationResolutionMeters: null,
    };

    if (selectedEva?.sequence && mission) {
      const planetRadius = parseFloat(mission?.config.msv.radius.minor);

      storeRef.current.elevationResolutionMeters = mission.config.tools.find(
        (tool) => tool.name === "Measure"
      )?.variables["resolution"];
      storeRef.current.landerElevationMeters = mission.landerElevationMeters;

      for (const sequenceItem of selectedEva.sequence) {
        const sequenceItemForPaperJS: EvaSequenceItem_PaperJS = {
          ...sequenceItem,
          name: null,
          secondsStart: storeRef.current.evaLengthCalculatedMins * 60,
          totalDurationMins: null,
          traverseRateMSec: null,
        };

        //get station or traverse
        if (sequenceItem.type === "station") {
          const station = stations.find((s) => s.uuid === sequenceItem.uuid);
          if (!station) continue; //skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)

          sequenceItemForPaperJS.name = station.name;
          sequenceItemForPaperJS.stationElevation = station.elevation ? station.elevation : null;

          //get traverse rate for this sequence item in meters per second (eva rate falling back to mission rate)
          const traverseRate = _.isNumber(evaTraverseRate) ? evaTraverseRate : missionTraverseRate;
          sequenceItemForPaperJS.traverseRateMSec = traverseRate * (1000 / 3600); //convert to m/sec

          //calculate duration from actions assigned to station
          let durationMinutes = 0;
          for (const action of actions) {
            if (action.stationUuid === sequenceItem.uuid) {
              //duration values come in as strings during edit mode
              const upper = isNaN(action.durationUpper) ? null : +action.durationUpper;
              const lower = isNaN(action.durationLower) ? null : +action.durationLower;
              const actionDuration = upper || lower;
              durationMinutes += isNaN(actionDuration) ? 0 : actionDuration;
            }
          }
          sequenceItemForPaperJS.totalDurationMins = durationMinutes;
          storeRef.current.evaLengthCalculatedMins += durationMinutes; //add to sum for total length calculated

          if (mission.landerLocation) {
            //calculate distance to lander
            const landerDistance = getDistanceBetweenTwoCoordinates(
              station.location,
              mission.landerLocation,
              planetRadius
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

              // subdivide seach segment by 150 meters for greater accuracy
              const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
                station.walkbackPath,
                150,
                planetRadius
              );
              walkback.subdividedPath = newWalkbackPath;

              //loop through new subdivided walkback path
              for (let i = 0; i < newWalkbackPath.length; i++) {
                //calculate distance from lander. Track max distance
                const landerDistance = getDistanceBetweenTwoCoordinates(
                  newWalkbackPath[i],
                  mission.landerLocation,
                  planetRadius
                );

                if (landerDistance > storeRef.current.maxDistFromLanderMeters)
                  storeRef.current.maxDistFromLanderMeters = landerDistance;
                walkback.subdividedDistFromLanderMeters.push(landerDistance);

                //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
                if (i !== newWalkbackPath.length - 1) {
                  const distanceSegment = getDistanceBetweenTwoCoordinates(
                    newWalkbackPath[i],
                    newWalkbackPath[i + 1],
                    planetRadius
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
        } else if (sequenceItem.type === "traverse") {
          const traverse = traverses.find((t) => t.uuid === sequenceItem.uuid);

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
          const newTraverse: AEGISPoint[] = addPointsAtMeters(traverse.path, 150, planetRadius);
          sequenceItemForPaperJS.traverse.subdividedPath = newTraverse;

          sequenceItemForPaperJS.totalDurationMins = 0;
          //loop through new subdivided traverse
          for (let i = 0; i < newTraverse.length; i++) {
            if (mission.landerLocation) {
              //calculate distance from lander. Track max distance
              const landerDistance = getDistanceBetweenTwoCoordinates(
                newTraverse[i],
                mission.landerLocation,
                planetRadius
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
                planetRadius
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
    }
  }, [selectedEva, actions, evaTraverseRate, mission, missionTraverseRate, stations, traverses]);

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
  }, [
    selectedEva,
    selectedEvaSequenceItemUuid,
    showDistanceFromLander,
    showElevation,
    graphSequenceItems,
  ]);

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
    processDataFromStore(); //loads data into the storeRef
    drawTimeline();

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
      if (sequenceUuid) {
        dispatch(selectEVASequenceItem({ sequenceItemUuid: sequenceUuid }));
      }
    };

    return () => paper.project.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedEva,
    processDataFromStore,
    storeRef,
    dispatch,
    setHoverValues,
    selectedEvaSequenceItemUuid,
    showDistanceFromLander,
    showElevation,
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
      <TimelineHoverValues hoverValues={hoverValues} />
      <div className={styles.canvasContainer}>
        <div className={styles.timelineBodyItem}>
          <canvas ref={canvas} data-paper-resize />
        </div>
      </div>
      <div className={styles.timelineRight}>
        <STM_Coverage
          actions={actions.filter((action) =>
            selectedEva?.sequence.some((sequenceItem) => sequenceItem.uuid === action.stationUuid)
          )}
          mini={true}
          horizontal={false}
        />
      </div>
    </div>
  );
};

export default NavTimeline;

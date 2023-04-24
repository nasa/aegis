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
import { IconButton } from "./_global-elements";
import { faChartArea, faChartLine } from "@fortawesome/free-solid-svg-icons";
import { setShowDistanceFromLander, setShowElevation } from "store/interface";

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
        <IconButton
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
        <IconButton
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
  const evaTraverseRate = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid)?.traverseRate,
    refEqual
  );
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const showDistanceFromLander = useAppSelector(
    (state) => state.interface.timelineShowDistanceFromLander,
    refEqual
  );
  const showElevation = useAppSelector((state) => state.interface.timelineShowElevation, refEqual);

  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const paperDataRef: MutableRefObject<PaperData> = useRef(null);
  const storeRef: MutableRefObject<StoreData_PaperJS> = useRef(null);
  const paperGroupsRef: MutableRefObject<PaperGroups> = useRef(null);
  const graphSequenceItems: MutableRefObject<GraphSequenceItems> = useRef(null);
  const flattenedGraphData: MutableRefObject<GraphData> = useRef({
    distanceFromLanderXY: [],
    elevationXY: [],
    walkbackXY: [],
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
      flattenedGraphData: null,
      selectedEvaSequenceItemUuid: null,
      maxDistFromLanderMeters: 0,
      evaLengthMins: selectedEva?.maxDuration ? +selectedEva?.maxDuration : 240, //default 4 hours in minutes
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
          subdividedCoordinates: null,
          secondsStart: storeRef.current.evaLengthCalculatedMins * 60,
          subdividedDurationsMins: null,
          subdividedTotalDurationMins: null,
          subdividedDistFromLanderMeters: null,
          segmentElevationMeters: null,
          segmentDistancesMeters: null,
        };
        if (sequenceItem.type === "station") {
          const station = stations.find((station) => station.uuid === sequenceItem.uuid);
          if (!station) continue; //skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)
          sequenceItemForPaperJS.name = station.name;
          sequenceItemForPaperJS.subdividedCoordinates = station.location;
          sequenceItemForPaperJS.segmentElevationMeters = station.elevation
            ? [[station.elevation]]
            : null;

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
          sequenceItemForPaperJS.subdividedDurationsMins = [durationMinutes];
          sequenceItemForPaperJS.subdividedTotalDurationMins = durationMinutes;
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
            sequenceItemForPaperJS.subdividedDistFromLanderMeters = [landerDistance];

            //calculate walkback path if this station has a walkback
            if (station.walkbackPath) {
              const walkback: Walkback_PaperJS = {
                subdividedPath: null,
                subdividedDurationMins: null,
                subdividedDistFromLanderMeters: null,
                segmentElevationMeters: null,
                segmentDistancesMeters: null,
              };
              // subdivide seach segment by 150 meters for greater accuracy
              const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
                station.walkbackPath,
                150,
                planetRadius
              );
              walkback.subdividedPath = newWalkbackPath;

              walkback.subdividedDurationMins = [];
              walkback.subdividedDistFromLanderMeters = [];
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
                  const duration = isNaN(evaTraverseRate)
                    ? 0
                    : (distanceSegment / (+evaTraverseRate * 1000)) * 60;
                  walkback.subdividedDurationMins.push(duration);
                }
              }

              //set elevation data
              walkback.segmentElevationMeters = station.walkbackPathSegmentElevations;
              walkback.segmentDistancesMeters = station.walkbackPathSegmentDistances;

              //set walkback data
              sequenceItemForPaperJS.walkback = walkback;
            }
          }
        } else if (sequenceItem.type === "traverse") {
          const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
          if (!traverse || traverse?.path?.length < 2) continue; //skip traverses with less than 2 points
          sequenceItemForPaperJS.name = traverse.name;

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

          //set the traverse rate for the sequence item in meters per second
          const traverseRate = traverse.traverseRate ? +traverse.traverseRate : evaTraverseRate;
          sequenceItemForPaperJS.traverseRateMSec = traverseRate * (1000 / 3600);

          //subdivide seach traverse segment by 150 meters for greater accuracy
          const newTraverse: AEGISPoint[] = addPointsAtMeters(traverse.path, 150, planetRadius);
          sequenceItemForPaperJS.subdividedCoordinates = newTraverse;

          sequenceItemForPaperJS.subdividedDistFromLanderMeters = [];
          sequenceItemForPaperJS.subdividedDurationsMins = [];
          sequenceItemForPaperJS.subdividedTotalDurationMins = 0;
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
              sequenceItemForPaperJS.subdividedDistFromLanderMeters.push(landerDistance);
            }

            //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
            if (i !== newTraverse.length - 1) {
              const distanceSegment = getDistanceBetweenTwoCoordinates(
                newTraverse[i],
                newTraverse[i + 1],
                planetRadius
              );
              const duration = isNaN(traverseRate)
                ? 0
                : (distanceSegment / (+traverseRate * 1000)) * 60;
              sequenceItemForPaperJS.subdividedDurationsMins.push(duration);
              sequenceItemForPaperJS.subdividedTotalDurationMins += duration;
              storeRef.current.evaLengthCalculatedMins += duration; //add to sum for total length calculated
            }
          }

          //elevation
          sequenceItemForPaperJS.segmentElevationMeters = traverse.pathSegmentElevations;
          sequenceItemForPaperJS.segmentDistancesMeters = traverse.pathSegmentDistances;
        }
        storeRef.current.sequenceItems.push(sequenceItemForPaperJS);
      }
    }
  }, [selectedEva, stations, actions, traverses, evaTraverseRate, mission]);

  //handles on mouse move over the paper canvas
  const onMouseMove = (event: paper.MouseEvent) => {
    TimelineDrawing.drawMouseHover(
      dispatch,
      paperDataRef,
      paperGroupsRef,
      storeRef,
      flattenedGraphData,
      event.point.x,
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
  }, [selectedEva, selectedEvaSequenceItemUuid, showDistanceFromLander, showElevation]);

  //use effect to handle color highlighting when selected sequence item changes
  useEffect(() => {
    storeRef.current.selectedEvaSequenceItemUuid = selectedEvaSequenceItemUuid;
    //redraw entire timeline
    drawTimeline();
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

    // paper.view.onMouseEnter = () => {};
    paper.view.onMouseLeave = () => {
      paperGroupsRef.current.hoverLine.visible = false;
      dispatch(clearMapItemHover());

      //clear hover values
      setHoverValues(initHoverValues);
    };
    paper.view.onResize = function () {
      drawTimeline();
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
    if (selectedEvaSequenceItemUuid) {
      flattenedGraphData.current.walkbackXY =
        graphSequenceItems.current[selectedEvaSequenceItemUuid].walkbackXY;
      flattenedGraphData.current.walkbackElevationXY =
        graphSequenceItems.current[selectedEvaSequenceItemUuid].walkbackElevationXY;
    } else {
      flattenedGraphData.current.walkbackXY = [];
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
          uniqueKey="evaTimelineStm"
        />
      </div>
    </div>
  );
};

/**
 * Calculate elevation point array
 * @param segmentedElevationMeters elevation by segments
 * @param segmentedDistancesMeters distances by segments
 * @returns an array of elevation graph data
 */
function calcElevationGraphData(
  segmentedElevationMeters: number[][],
  segmentedDistancesMeters: number[],
  xLocStart: number,
  totalDurationMins: number,
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<StoreData_PaperJS>,
  traverseRateMSec: number
): GraphDataItem[] {
  const paperVars = paperDataRef.current.paperVars;
  //consts used for calculating elevation
  const elevationResolution = storeRef.current.elevationResolutionMeters || 10; //10 default
  const elevationWidth = (elevationResolution / traverseRateMSec) * paperVars.pixelsPerSecondX;

  const graphData_elevation: GraphDataItem[] = [];
  let xLoc = xLocStart;
  for (const [segmentElevationIndex, segmentElevation] of segmentedElevationMeters.entries()) {
    //loop through elevations
    for (const [elevationIndex, elevation] of segmentElevation.entries()) {
      graphData_elevation.push({
        xPixel: xLoc,
        yPixel:
          paperVars.timelineTop +
          (storeRef.current.maxElevationMeters - elevation) * paperVars.pixelsPerMeterElevationY,
        val: elevation,
      });

      //the last point of current segment is equal to the first point in the next segment
      //  don't increment the x coordinate
      if (elevationIndex !== segmentElevation.length - 1) xLoc += elevationWidth;

      //the last elevation point may not be exactly the elevation resolution distance.
      //  don't use width. take the duration for this segment and set the x location
      //  for the next loop to be the end of the segment.
      if (elevationIndex === segmentElevation.length - 2) {
        let accumuatliveSegmentDistance = 0;
        for (let i = 0; i <= segmentElevationIndex; i++) {
          accumuatliveSegmentDistance += segmentedDistancesMeters[i];
        }
        xLoc =
          xLocStart +
          accumuatliveSegmentDistance * (1 / traverseRateMSec) * paperVars.pixelsPerSecondX;
      }

      //this is a station
      if (segmentElevation.length === 1) {
        xLoc = xLocStart + totalDurationMins * 60 * paperVars.pixelsPerSecondX;
        graphData_elevation.push({
          xPixel: xLoc,
          yPixel:
            paperVars.timelineTop +
            (storeRef.current.maxElevationMeters - elevation) * paperVars.pixelsPerMeterElevationY,
          val: elevation,
        });
      }
    }
  }

  return graphData_elevation;
}

/**
 * Initilize the graph items ref
 * This func translates all the geo data from the store into paper x y pixels for drawing
 * @param paperDataRef
 * @param storeRef
 * @param graphSequenceItems
 * @param flattenedGraphData
 */
function initGraphItemsRef(
  paperDataRef: MutableRefObject<PaperData>,
  storeRef: MutableRefObject<StoreData_PaperJS>,
  graphSequenceItems: MutableRefObject<GraphSequenceItems>,
  flattenedGraphData: MutableRefObject<GraphData>
) {
  //init graph data
  graphSequenceItems.current = {};

  const paperVars = paperDataRef.current.paperVars;
  //loop through sequence items
  for (const sequenceItem of storeRef.current.sequenceItems) {
    const sequenceStartPixel =
      paperVars.timelineLeft + sequenceItem.secondsStart * paperVars.pixelsPerSecondX;

    //calculate xy coordinates for all the graph lines
    const graphData_distFromLndr: GraphDataItem[] = []; //the distance from lander for the sequence
    let graphData_elevation: GraphDataItem[] = []; //elevation profile for the sequence
    const graphData_walkback: GraphDataItem[] = []; //all walkbacks for the sequence.
    let graphData_walkbackElevation: GraphDataItem[] = []; //all walkback elevations for the sequence

    //check if we have lander data
    if (
      sequenceItem.subdividedDistFromLanderMeters &&
      sequenceItem.subdividedDistFromLanderMeters.length > 0
    ) {
      //calc walkback if this is a station and it has a walkback
      if (sequenceItem.type === "station" && sequenceItem.walkback) {
        const walkbackData = sequenceItem.walkback;

        //calc walkback distance from lander
        let itemLocX_walkback: number = sequenceStartPixel; //x location for this walkback
        for (const [durationIndex, duration] of walkbackData.subdividedDurationMins.entries()) {
          const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
          const itemLocYStart =
            paperVars.timelineTop +
            paperVars.graphHeight -
            walkbackData.subdividedDistFromLanderMeters[durationIndex] *
              paperVars.pixelsPerMeterDistanceY;
          graphData_walkback.push({
            xPixel: itemLocX_walkback,
            yPixel: itemLocYStart,
            val: walkbackData.subdividedDistFromLanderMeters[durationIndex],
          });

          //we're on the last duration item
          if (durationIndex === walkbackData.subdividedDurationMins.length - 1) {
            //add on the last point
            //distance array should have +1 more item than the duration array.
            const walkbackDistMetersEnd =
              walkbackData.subdividedDistFromLanderMeters[durationIndex + 1]; //meters
            const itemLocYEnd =
              paperVars.timelineTop +
              paperVars.graphHeight -
              walkbackDistMetersEnd * paperVars.pixelsPerMeterDistanceY;
            graphData_walkback.push({
              xPixel: itemLocX_walkback + width,
              yPixel: itemLocYEnd,
              val: walkbackDistMetersEnd,
            });
          }
          itemLocX_walkback += width;
        }

        //calc walkback elevation
        if (storeRef.current.landerElevationMeters && walkbackData.segmentElevationMeters) {
          graphData_walkbackElevation = calcElevationGraphData(
            walkbackData.segmentElevationMeters,
            walkbackData.segmentDistancesMeters,
            sequenceStartPixel,
            walkbackData.subdividedDurationMins.reduce(
              (accumulator, currentValue) => accumulator + currentValue,
              0
            ),
            paperDataRef,
            storeRef,
            sequenceItem.traverseRateMSec
          );
        }
      }

      //calc distance from lander
      let itemLocX_dstFromLndr: number = sequenceStartPixel;
      for (const [durationIndex, duration] of sequenceItem.subdividedDurationsMins.entries()) {
        const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
        const distFromLanderMeters = sequenceItem.subdividedDistFromLanderMeters[durationIndex];
        const itemLocY =
          paperVars.timelineTop +
          paperVars.graphHeight -
          distFromLanderMeters * paperVars.pixelsPerMeterDistanceY;
        graphData_distFromLndr.push({
          xPixel: itemLocX_dstFromLndr,
          yPixel: itemLocY,
          val: distFromLanderMeters,
        });

        //we're on the last duration item
        if (durationIndex === sequenceItem.subdividedDurationsMins.length - 1) {
          //add on the last point
          if (sequenceItem.subdividedDistFromLanderMeters.length === 1) {
            //this is a station. Use the y value calculated from above
            graphData_distFromLndr.push({
              xPixel: itemLocX_dstFromLndr + width,
              yPixel: itemLocY,
              val: distFromLanderMeters,
            });
          } else {
            //distance array should have +1 more item than the duration array.
            const distFromLanderMetersEnd =
              sequenceItem.subdividedDistFromLanderMeters[durationIndex + 1]; //meters
            const itemLocYEnd =
              paperVars.timelineTop +
              paperVars.graphHeight -
              distFromLanderMetersEnd * paperVars.pixelsPerMeterDistanceY;
            graphData_distFromLndr.push({
              xPixel: itemLocX_dstFromLndr + width,
              yPixel: itemLocYEnd,
              val: distFromLanderMetersEnd,
            });
          }
        }
        itemLocX_dstFromLndr += width; //increment x
      }
    }

    //calc elevation profile
    if (storeRef.current.landerElevationMeters && sequenceItem.segmentElevationMeters) {
      graphData_elevation = calcElevationGraphData(
        sequenceItem.segmentElevationMeters,
        sequenceItem.segmentDistancesMeters,
        sequenceStartPixel,
        sequenceItem.subdividedTotalDurationMins,
        paperDataRef,
        storeRef,
        sequenceItem.traverseRateMSec
      );
    }

    //create a new graph item for this sequence item
    graphSequenceItems.current[sequenceItem.uuid] = {
      type: sequenceItem.type,
      distanceFromLanderXY: graphData_distFromLndr,
      elevationXY: graphData_elevation,
      walkbackXY: graphData_walkback,
      walkbackElevationXY: graphData_walkbackElevation,
    } as GraphSequenceData;

    // flatten the graph data items from all sequences to make it easier to access for hover values
    // note that walkback data is not added to the flattened graph data here. Instead, it's added using a useEffect based on the selected station
    flattenedGraphData.current.distanceFromLanderXY = [
      ...flattenedGraphData.current.distanceFromLanderXY,
      ...graphData_distFromLndr,
    ];
    flattenedGraphData.current.elevationXY = [
      ...flattenedGraphData.current.elevationXY,
      ...graphData_elevation,
    ];
  }
}

/**
 * Initialize refs for paper. Sets colors and pixel boundaries based on canvas size
 */
function initPaperRefs(
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<StoreData_PaperJS>
) {
  //init groups
  paperGroupsRef.current = {
    graphBkg: new paper.Group(),
    hoverLine: new paper.Group(),
  };

  //init paper vars and styles
  paperDataRef.current = {
    styles: {
      gNavigatorFontFamilyActivity: "Inter",
      blue: new paper.Color("#93AFD7"),
      brightBlue: new paper.Color("#00C2FF"),
      green: new paper.Color("#8fae95"),
      yellow: new paper.Color("#ffc700"),
      lightYellow: new paper.Color("#41403B"),
      gray1: new paper.Color("#616574"),
      gray2: new paper.Color("#a9a9a9"),
      gray3: new paper.Color("#424653"),
      gray4: new paper.Color("#313440"),
      white: new paper.Color("#EEEEEE"),
      red: new paper.Color("#FC5454"),
    },
    paperVars: {
      canvasWidth: paper.view.size.width, //full drawing area
      canvasHeight: paper.view.size.height,
      timelineHeight: null, //just the graph drawing area
      timeineWidth: null,
      timelineTop: null,
      timelineLeft: null,
      sequenceTop: null,
      sequenceHeight: null,
      graphHeight: null,
      pixelsPerSecondX: null,
      pixelsPerMeterDistanceY: null,
      pixelsPerMeterElevationY: null,
      landerElevationFromGraphTop: null,
    },
  };

  //calculate paper vars. These are pixel and spacing variables that help determine where to draw things
  const paperVars = paperDataRef.current.paperVars; //save this to a shorter reference so it reduces the variable name when used below

  const YAxisLabelWidth = 75;
  paperVars.timeineWidth = paperVars.canvasWidth - YAxisLabelWidth * 2;
  paperVars.timelineHeight = paperVars.canvasHeight - 60;
  paperVars.timelineTop = 10;
  paperVars.timelineLeft = YAxisLabelWidth;
  paperVars.sequenceTop = paperVars.timelineTop + paperVars.timelineHeight;
  paperVars.sequenceHeight = 20;
  paperVars.graphHeight = paperVars.sequenceTop - paperVars.timelineTop - 4; //4px buffer between graph bottom and beginning of sequence
  paperVars.pixelsPerSecondX =
    paperVars.timeineWidth /
    (Math.max(storeRef.current.evaLengthMins, storeRef.current.evaLengthCalculatedMins) * 60);
  paperVars.pixelsPerMeterDistanceY =
    paperVars.graphHeight / storeRef.current.maxDistFromLanderMeters;
  paperVars.pixelsPerMeterElevationY =
    paperVars.graphHeight /
    (storeRef.current.maxElevationMeters - storeRef.current.minElevationMeters);
  if (!storeRef.current.landerElevationMeters) {
    paperVars.landerElevationFromGraphTop = null;
  } else {
    paperVars.landerElevationFromGraphTop =
      (storeRef.current.maxElevationMeters - storeRef.current.landerElevationMeters) *
      paperVars.pixelsPerMeterElevationY;
  }
}

export default NavTimeline;

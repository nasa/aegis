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
import * as TimelineDrawing from "./timelineDrawing";

/**
 * Initialize a new paper ref. Calcaulates all the information needed for paper
 *  given the data in the store ref and canvas size
 */
function initPaperRefs(
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<StoreData_PaperJS>,
  graphItems: MutableRefObject<GraphItems>
) {
  //init groups
  paperGroupsRef.current = {
    graphBkg: new paper.Group(),
    hoverLine: new paper.Group(),
    graphAxis: new paper.Group(),
  };

  //init paper vars and styles
  paperDataRef.current = {
    styles: {
      lineColor: new paper.Color("#616574"), //var(--grey3)
      labelColor: new paper.Color("#a9a9a9"), //var(--grey4)
      sequenceColor: new paper.Color("#93AFD7"), // light blue
      // startEndHighlight: new paper.Color("#00C2FF"), // blue
      startEndHighlight: new paper.Color("#EEEEEE"), // almost white
      selectedBkgColor: new paper.Color("#41403B"),
      selectedColor: new paper.Color("#ffc700"), //var(--eva)
      availableBkgColor: new paper.Color("#424653"), //var(--grey2)
      regularBkgColor: new paper.Color("#313440"), //var(--grey1)
      walkbackColor: new paper.Color("#93AFD7"),
      gNavigatorFontFamilyActivity: "Inter",
      hoverColor: new paper.Color("#00C2FF"),
      elevationColor: new paper.Color("#8fae95"),
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

  //init graph data
  graphItems.current = {};

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

  //consts used for calculating elevation
  const elevationResolution = storeRef.current.elevationResolutionMeters || 10; //10 default
  const elevationWidth =
    (elevationResolution / storeRef.current.traverseRateMSec) * paperVars.pixelsPerSecondX;

  //loop through sequence items
  for (const sequenceItem of storeRef.current.sequenceItems) {
    const sequenceStartPixel =
      paperVars.timelineLeft + sequenceItem.secondsStart * paperVars.pixelsPerSecondX;

    //calculate xy coordinates for all the graph lines
    const graphData_distFromLndr: GraphData[] = []; //the distance from lander for the sequence
    const graphData_elevation: GraphData[] = []; //elevation profile for the sequence
    const graphData_walkback: GraphData[] = []; //all walkbacks for the sequence.
    const graphData_walkbackElevation: GraphData[] = []; //all walkback elevations for the sequence

    //check if we have lander data
    if (
      sequenceItem.subdividedDistFromLanderMeters &&
      sequenceItem.subdividedDistFromLanderMeters.length > 0
    ) {
      //calc walkback if this is a station and it has a walkback
      if (sequenceItem.type === "station" && sequenceItem.walkback) {
        //calc walkback distance from lander
        let itemLocX_walkback: number = sequenceStartPixel; //x location for this walkback
        const walkbackData = sequenceItem.walkback;
        for (const [durationIndex, duration] of walkbackData.subdividedDurationMins.entries()) {
          const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
          const itemLocYStart =
            paperVars.timelineTop +
            paperVars.graphHeight -
            walkbackData.subdividedDistFromLanderMeters[durationIndex] *
              paperVars.pixelsPerMeterDistanceY;
          graphData_walkback.push({
            xPixels: itemLocX_walkback,
            yPixels: itemLocYStart,
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
              xPixels: itemLocX_walkback + width,
              yPixels: itemLocYEnd,
              val: walkbackDistMetersEnd,
            });
          }
          itemLocX_walkback += width;
        }

        //calc walkback elevation TODO
      }

      //calc distance from lander point array
      let itemLocX_dstFromLndr: number = sequenceStartPixel;
      for (const [durationIndex, duration] of sequenceItem.subdividedDurationsMins.entries()) {
        const width = duration * paperVars.pixelsPerSecondX * 60; //duration is in minutes
        const distFromLanderMeters = sequenceItem.subdividedDistFromLanderMeters[durationIndex];
        const itemLocY =
          paperVars.timelineTop +
          paperVars.graphHeight -
          distFromLanderMeters * paperVars.pixelsPerMeterDistanceY;
        graphData_distFromLndr.push({
          xPixels: itemLocX_dstFromLndr,
          yPixels: itemLocY,
          val: distFromLanderMeters,
        });

        //we're on the last duration item
        if (durationIndex === sequenceItem.subdividedDurationsMins.length - 1) {
          //add on the last point
          if (sequenceItem.subdividedDistFromLanderMeters.length === 1) {
            //this is a station. Use the y value calculated from above
            graphData_distFromLndr.push({
              xPixels: itemLocX_dstFromLndr + width,
              yPixels: itemLocY,
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
              xPixels: itemLocX_dstFromLndr + width,
              yPixels: itemLocYEnd,
              val: distFromLanderMetersEnd,
            });
          }
        }
        itemLocX_dstFromLndr += width; //increment x
      }
    }

    //calc elevation profile point array
    if (storeRef.current.landerElevationMeters && sequenceItem.segmentElevationMeters) {
      let itemLocX_elevation: number = sequenceStartPixel;

      //loop through segments
      for (const [
        segmentElevationIndex,
        segmentElevation,
      ] of sequenceItem.segmentElevationMeters.entries()) {
        //loop through elevations
        for (const [elevationIndex, elevation] of segmentElevation.entries()) {
          graphData_elevation.push({
            xPixels: itemLocX_elevation,
            yPixels:
              paperVars.timelineTop +
              (storeRef.current.maxElevationMeters - elevation) *
                paperVars.pixelsPerMeterElevationY,
            val: elevation,
          });

          //the last point of current segment is equal to the first point in the next segment
          //  don't increment the x coordinate
          if (elevationIndex !== segmentElevation.length - 1) itemLocX_elevation += elevationWidth;

          //the last elevation point may not be exactly the elevation resolution distance.
          //  don't use width. take the duration for this segment and set the x location
          //  for the next loop to be the end of the segment.
          if (elevationIndex === segmentElevation.length - 2) {
            let accumuatliveSegmentDistance = 0;
            for (let i = 0; i <= segmentElevationIndex; i++) {
              accumuatliveSegmentDistance += sequenceItem.segmentDistancesMeters[i];
            }
            itemLocX_elevation =
              sequenceStartPixel +
              accumuatliveSegmentDistance *
                (1 / storeRef.current.traverseRateMSec) *
                paperVars.pixelsPerSecondX;
          }

          //this is a station
          if (segmentElevation.length === 1) {
            itemLocX_elevation =
              sequenceStartPixel +
              sequenceItem.subdividedTotalDurationMins * 60 * paperVars.pixelsPerSecondX;
            graphData_elevation.push({
              xPixels: itemLocX_elevation,
              yPixels:
                paperVars.timelineTop +
                (storeRef.current.maxElevationMeters - elevation) *
                  paperVars.pixelsPerMeterElevationY,
              val: elevation,
            });
          }
        }
      }
    }

    //create a new graph item for this sequence item
    graphItems.current[sequenceItem.uuid] = {
      type: sequenceItem.type,
      distanceFromLanderXY: graphData_distFromLndr,
      elevationProfileXY: graphData_elevation,
      walkbackXY: graphData_walkback,
      walkbackElevationXY: graphData_walkbackElevation,
    } as GraphItem;
  }
}

/**
 * Main function to draw the timeline. All the paper drawing happens here
 */
function drawTimeline(
  paperDataRef: MutableRefObject<PaperData>,
  paperGroupsRef: MutableRefObject<PaperGroups>,
  storeRef: MutableRefObject<StoreData_PaperJS>,
  graphItems: MutableRefObject<GraphItems>,
  isEvaSelected: boolean,
  selectedEvaSequenceItemUuid: string
) {
  //clear project and initilize paper refs
  paper.project.clear();
  initPaperRefs(paperDataRef, paperGroupsRef, storeRef, graphItems);

  TimelineDrawing.drawGraphAxis(paperDataRef, storeRef);
  //draw all the things
  if (isEvaSelected) {
    TimelineDrawing.drawSequenceBottomSection(
      paperDataRef,
      paperGroupsRef,
      storeRef,
      selectedEvaSequenceItemUuid
    );
    TimelineDrawing.drawLanderDistanceGraph(paperDataRef, graphItems);
    TimelineDrawing.drawWalkbacks(paperDataRef, graphItems);
    TimelineDrawing.drawElevationProfile(paperDataRef, graphItems);
  }
}

const TimelineHoverValues = ({ hoverValues }) => {
  return (
    <div className={styles.timelineHoverValues}>
      <div className={styles.timelineHoverValueTitle}>Distance From Lander</div>
      <div className={styles.timelineHoverValue}>
        {hoverValues.distanceFromLanderMeters?.toFixed(2)} m
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

  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const paperDataRef: MutableRefObject<PaperData> = useRef(null);
  const storeRef: MutableRefObject<StoreData_PaperJS> = useRef(null);
  const paperGroupsRef: MutableRefObject<PaperGroups> = useRef(null);
  const graphItems: MutableRefObject<GraphItems> = useRef(null);

  const [hoverValues, setHoverValues] = useState({
    distanceFromLanderMeters: null,
    elevationMeters: null,
    slopeMetersPerMeter: null,
    walkbackDistanceFromLanderMeters: null,
    walkbackElevationMeters: null,
    walkbackSlopeMetersPerMeter: null,
  });

  /**
   * Populate storeRefs with all our store information so paper.js can read it.
   * Perform additional calculations required for drawing, such as subdividing any paths
   */
  const processDataFromStore = useCallback(() => {
    storeRef.current = {
      sequenceItems: [],
      selectedEvaSequenceItemUuid: null,
      maxDistFromLanderMeters: 0,
      evaLengthMins: selectedEva?.maxDuration ? +selectedEva?.maxDuration : 240, //default 4 hours in minutes
      evaLengthCalculatedMins: 0,
      maxElevationMeters: null,
      minElevationMeters: null,
      landerElevationMeters: null,
      traverseRateMSec: null,
      elevationResolutionMeters: null,
    };

    if (selectedEva?.sequence && mission) {
      const planetRadius = parseFloat(mission?.config.msv.radius.minor);

      storeRef.current.traverseRateMSec = isNaN(evaTraverseRate)
        ? 0
        : +evaTraverseRate * (1000 / 3600);
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
              const duration = isNaN(evaTraverseRate)
                ? 0
                : (distanceSegment / (+evaTraverseRate * 1000)) * 60;
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

  //use effect to handle color highlighting when selected sequence item changes
  useEffect(() => {
    storeRef.current.selectedEvaSequenceItemUuid = selectedEvaSequenceItemUuid;
    drawTimeline(
      paperDataRef,
      paperGroupsRef,
      storeRef,
      graphItems,
      selectedEva !== undefined,
      selectedEvaSequenceItemUuid
    );
  }, [selectedEvaSequenceItemUuid, selectedEva]);

  // Initialize the timeline on first render
  useLayoutEffect(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }
    processDataFromStore(); //loads data into the storeRef
    drawTimeline(
      paperDataRef,
      paperGroupsRef,
      storeRef,
      graphItems,
      selectedEva !== undefined,
      selectedEvaSequenceItemUuid
    );

    //event handlers
    paper.view.onMouseMove = TimelineDrawing.throttledOnMouseMove(
      dispatch,
      paperDataRef,
      paperGroupsRef,
      storeRef,
      graphItems,
      hoverValues,
      setHoverValues,
      15
    );
    // paper.view.onMouseEnter = () => {};
    paper.view.onMouseLeave = () => {
      paperGroupsRef.current.hoverLine.visible = false;
      dispatch(clearMapItemHover());
    };
    paper.view.onResize = function () {
      drawTimeline(
        paperDataRef,
        paperGroupsRef,
        storeRef,
        graphItems,
        selectedEva !== undefined,
        selectedEvaSequenceItemUuid
      );
    };

    return () => paper.project.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEva, processDataFromStore, storeRef, dispatch, setHoverValues]);

  return (
    <div className={styles.timelineContainer}>
      <TimelineHoverValues hoverValues={hoverValues} />
      <div className={styles.canvasContainer}>
        <canvas ref={canvas} data-paper-resize />
      </div>
      <div className={styles.timelineStmContainer}>
        <STM_Coverage actions={actions} mini={true} horizontal={false} uniqueKey="evaTimelineStm" />
      </div>
    </div>
  );
};

export default NavTimeline;

import isNil from "lodash/isNil";
import paper from "paper";
import {
  FunctionComponent,
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";

import styles from "./timeline.module.css";
import { padZeros } from "utils/formatting";
import {
  generateEquidistantPointsAlongPolyline,
  getDistanceBetweenTwoCoordinates,
  getTotalDistance,
} from "utils/geoMath";

interface PaperDrawings {
  timeMarkers: paper.Group;
  evaSequence: paper.Group[];
  landerDistance: paper.Group[];
  graphBkg: paper.Group;
  graphAxis: paper.Group;
  styles: {
    lineColor: paper.Color;
    sequenceColor: paper.Color;
    startEndHighlight: paper.Color;
    selectedBkgColor: paper.Color;
    selectedColor: paper.Color;
    availableBkgColor: paper.Color;
    regularBkgColor: paper.Color;
    gNavigatorFontFamilyActivity: string;
  };
}

interface StoreData {
  sequenceItems: EvaSequenceItem_PaperJS[];
  selectedEvaSequenceItemUuid: string;
  maxDistanceFromLander: number;
  evaLength: number; //minutes. user input eva length
  evaLengthCalculated: number; //minutes. actual eval length from the station actions and traverses
}

interface EvaSequenceItem_PaperJS extends EvaSequenceItem {
  durations: number[]; //hours
  name: string;
  locations: AEGISPoint | AEGISPoint[];
  distanceFromLander: number[]; //meters
}

/**
 * Renders the navigation timeline presented at the bottom of the window
 */
const NavTimeline: FunctionComponent = () => {
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
  const landerLocation = useAppSelector(
    (state) => state.mission.mission?.landerLocation,
    shallowEqual
  );
  const planetRadius = useAppSelector(
    (state) => state.mission.mission?.config.msv.radius.minor,
    refEqual
  );
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);

  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const paperRefs: MutableRefObject<PaperDrawings> = useRef(null);
  const storeRefs: MutableRefObject<StoreData> = useRef(null);

  //populate useRef information with all our store information so paper.js can read it
  const loadUseRefs = useCallback(() => {
    storeRefs.current = {
      sequenceItems: [],
      selectedEvaSequenceItemUuid: selectedEvaSequenceItemUuid,
      maxDistanceFromLander: 0,
      evaLength: isNaN(selectedEva?.maxDuration) ? null : +selectedEva?.maxDuration || 240, //default 4 hours in minutes
      evaLengthCalculated: 0,
    };

    if (selectedEva?.sequence) {
      for (const sequenceItem of selectedEva.sequence) {
        const sequenceItemForPaperJS: EvaSequenceItem_PaperJS = {
          ...sequenceItem,
          durations: null,
          name: null,
          locations: null,
          distanceFromLander: null,
        };
        if (sequenceItem.type === "station") {
          const station = stations.find((station) => station.uuid === sequenceItem.uuid);

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
          sequenceItemForPaperJS.durations = [durationMinutes];
          storeRefs.current.evaLengthCalculated += durationMinutes; //add to sum for total length calculated
          sequenceItemForPaperJS.name = station.name;
          sequenceItemForPaperJS.locations = station.location;

          //calculate distance to lander
          const landerDistance = getDistanceBetweenTwoCoordinates(
            station.location,
            landerLocation,
            parseFloat(planetRadius)
          );
          if (landerDistance > storeRefs.current.maxDistanceFromLander)
            storeRefs.current.maxDistanceFromLander = landerDistance;
          sequenceItemForPaperJS.distanceFromLander = [landerDistance];
        } else if (sequenceItem.type === "traverse") {
          const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);

          //subdivide seach segmet by 150 meters for greater accuracy
          const numPointsAt150Meters =
            getTotalDistance(traverse.location, parseInt(planetRadius)) / 150;
          const newTraverse: AEGISPoint[] = generateEquidistantPointsAlongPolyline(
            traverse.location,
            numPointsAt150Meters,
            parseInt(planetRadius)
          );

          sequenceItemForPaperJS.distanceFromLander = [];
          sequenceItemForPaperJS.durations = [];
          for (let i = 0; i < newTraverse.length; i++) {
            //calculate distances to lander
            const landerDistance = getDistanceBetweenTwoCoordinates(
              newTraverse[i],
              landerLocation,
              parseFloat(planetRadius)
            );
            if (landerDistance > storeRefs.current.maxDistanceFromLander)
              storeRefs.current.maxDistanceFromLander = landerDistance;
            sequenceItemForPaperJS.distanceFromLander.push(landerDistance);

            //calculate duration. distance is in m, rate is in km/hr, duration is in minutes
            if (i !== newTraverse.length - 1) {
              const distanceSegment = getDistanceBetweenTwoCoordinates(
                newTraverse[i],
                newTraverse[i + 1],
                parseFloat(planetRadius)
              );
              const duration = isNaN(evaTraverseRate)
                ? 0
                : (distanceSegment / (+evaTraverseRate * 1000)) * 60;
              sequenceItemForPaperJS.durations.push(duration);
              storeRefs.current.evaLengthCalculated += duration; //add to sum for total length calculated
            }
          }
          sequenceItemForPaperJS.name = traverse.name;
          sequenceItemForPaperJS.locations = newTraverse;
        }
        storeRefs.current.sequenceItems.push(sequenceItemForPaperJS);
      }
    }
  }, [
    selectedEva,
    stations,
    actions,
    traverses,
    evaTraverseRate,
    planetRadius,
    landerLocation,
    selectedEvaSequenceItemUuid,
  ]);

  //highlight the drawing for the selected sequence index
  const highlightSelection = useCallback(() => {
    const sequenceItemUuid = storeRefs.current.selectedEvaSequenceItemUuid;
    //highlight time markers
    for (let i = 0; i < paperRefs.current.timeMarkers.children.length; i++) {
      const timeMarkerGroup = paperRefs.current.timeMarkers.children[i];
      if (timeMarkerGroup.name === sequenceItemUuid) {
        setColorForItems(timeMarkerGroup.children, paperRefs.current.styles.selectedColor);
        if (i > 0) {
          const prevTimeMarkerGroup = paperRefs.current.timeMarkers.children[i - 1];
          setColorForItems(prevTimeMarkerGroup.children, paperRefs.current.styles.selectedColor);
        }
      } else if (i === paperRefs.current.timeMarkers.children.length - 1) {
        setColorForItems(timeMarkerGroup.children, paperRefs.current.styles.startEndHighlight);
      } else {
        setColorForItems(timeMarkerGroup.children, paperRefs.current.styles.lineColor);
      }
    }

    //highlight sequence
    for (const sequenceItemGroup of paperRefs.current.evaSequence) {
      const color =
        sequenceItemGroup.name === sequenceItemUuid
          ? paperRefs.current.styles.selectedColor
          : paperRefs.current.styles.sequenceColor;
      setColorForItems(sequenceItemGroup.children, color);
    }

    //highlight background
    for (const backgroundGroup of paperRefs.current.graphBkg.children) {
      const color =
        backgroundGroup.name === sequenceItemUuid
          ? paperRefs.current.styles.selectedBkgColor
          : paperRefs.current.styles.regularBkgColor;
      setColorForItems([backgroundGroup], color);
    }

    //highlight distance graph
    for (const distanceGraphGroup of paperRefs.current.landerDistance) {
      const color =
        distanceGraphGroup.name === sequenceItemUuid
          ? paperRefs.current.styles.selectedColor
          : paperRefs.current.styles.sequenceColor;
      setColorForItems(distanceGraphGroup.children, color);
    }
  }, [paperRefs]);

  //use effect to handle when highlighting when sequence item changes
  useEffect(() => {
    storeRefs.current.selectedEvaSequenceItemUuid = selectedEvaSequenceItemUuid;
    highlightSelection();
  }, [selectedEvaSequenceItemUuid, highlightSelection]);

  //main function to draw the timeline. All the paper drawing happens here
  const drawTimeline = useCallback(() => {
    //clear project and initilize paper refs
    paper.project.clear();
    paperRefs.current = {
      timeMarkers: new paper.Group(),
      evaSequence: [],
      landerDistance: [],
      graphBkg: new paper.Group(),
      graphAxis: new paper.Group(),
      styles: {
        lineColor: new paper.Color("#616574"), //var(--grey3)
        sequenceColor: new paper.Color("#FFFFFF"),
        startEndHighlight: new paper.Color("#00C2FF"),
        selectedBkgColor: new paper.Color("#41403B"),
        selectedColor: new paper.Color("#ffc700"), //var(--eva)
        availableBkgColor: new paper.Color("#424653"), //var(--grey2)
        regularBkgColor: new paper.Color("#313440"), //var(--grey1)
        gNavigatorFontFamilyActivity: "Inter",
      },
    };

    //paper vars to help with math. Only used locally
    const paperVars = {
      canvasWidth: paper.view.size.width, //full drawing area
      canvasHeight: paper.view.size.height,
      graphHeight: null, //just the grpah drawing area
      graphWidth: null,

      pixelsPerSecond: null,
      secondsPerPixel: null,
      pixelsPerMeter: null,
      metersPerPixel: null,
      graphTop: null,
      graphLeft: null,
      sequenceTop: null,
      sequenceHeight: null,
      distanceGraphTop: null,
      distanceGraphHeight: null,
    };
    paperVars.graphWidth = paperVars.canvasWidth * 0.8;
    paperVars.graphHeight = paperVars.canvasHeight * 0.6;
    paperVars.pixelsPerSecond =
      paperVars.graphWidth /
      (Math.max(storeRefs.current.evaLength, storeRefs.current.evaLengthCalculated) * 60);
    paperVars.secondsPerPixel =
      (Math.max(storeRefs.current.evaLength, storeRefs.current.evaLengthCalculated) * 60) /
      paperVars.graphWidth;
    paperVars.graphTop = (paperVars.canvasHeight - paperVars.graphHeight) / 3;
    paperVars.graphLeft = (paperVars.canvasWidth - paperVars.graphWidth) / 2;
    paperVars.sequenceTop =
      paperVars.graphTop + paperVars.graphHeight - paperVars.graphHeight * 0.25;
    paperVars.sequenceHeight = paperVars.graphHeight * 0.2;
    paperVars.distanceGraphTop = paperVars.graphTop;
    paperVars.distanceGraphHeight = paperVars.sequenceTop - paperVars.graphTop - 4;
    paperVars.pixelsPerMeter =
      paperVars.distanceGraphHeight / storeRefs.current.maxDistanceFromLander;
    paperVars.metersPerPixel =
      storeRefs.current.maxDistanceFromLander / paperVars.distanceGraphHeight;

    //draws skeleton graph axis
    function drawGraphAxis() {
      //draw top and bottom lines
      const topLine = new paper.Path.Line({
        to: new paper.Point(paperVars.graphLeft, paperVars.graphTop),
        from: new paper.Point(paperVars.graphLeft + paperVars.graphWidth, paperVars.graphTop),
        strokeColor: paperRefs.current.styles.lineColor,
      });
      const bottomLine = new paper.Path.Line({
        from: new paper.Point(paperVars.graphLeft, paperVars.sequenceTop - 4),
        to: new paper.Point(paperVars.graphLeft + paperVars.graphWidth, paperVars.sequenceTop - 4),
        strokeColor: paperRefs.current.styles.lineColor,
      });
      paperRefs.current.graphAxis.addChildren([topLine, bottomLine]);

      //draw start and end lines for eva length
      drawTimeMarker(paperVars.graphLeft, paperRefs.current.styles.startEndHighlight);
      drawTimeMarker(
        paperVars.graphLeft + storeRefs.current.evaLength * paperVars.pixelsPerSecond * 60,
        paperRefs.current.styles.sequenceColor
      );

      //draw PET label
      const petLabel = new paper.PointText({
        point: new paper.Point(
          paperVars.graphLeft - 10,
          paperVars.graphTop + paperVars.graphHeight + 30
        ),
        justification: "left",
        fontFamily: paperRefs.current.styles.gNavigatorFontFamilyActivity,
        fontSize: 12,
        fillColor: "#FFFFFF",
        content: "PET",
      });
      petLabel.rotate(
        -90,
        new paper.Point(paperVars.graphLeft - 10, paperVars.graphTop + paperVars.graphHeight + 30)
      );

      //draw y axis meters
      drawMeterMarker(
        paperVars.graphTop,
        Math.round(storeRefs.current.maxDistanceFromLander).toString()
      );
      drawMeterMarker(paperVars.sequenceTop - 4, "0");
      //draw meter lines
      const numMarkers = Math.floor(paperVars.distanceGraphHeight / 20); //spacing for markers
      const metersBetweenMarkers = storeRefs.current.maxDistanceFromLander / numMarkers;
      for (let i = 1; i < numMarkers; i++) {
        drawMeterMarker(
          paperVars.graphTop + metersBetweenMarkers * i * paperVars.pixelsPerMeter,
          Math.round(storeRefs.current.maxDistanceFromLander - metersBetweenMarkers * i).toString()
        );
      }
    }

    //draws the distance from lander line graph
    function drawLanderDistanceGraph() {
      let itemLocX: number = paperVars.graphLeft;
      for (let i = 0; i < storeRefs.current.sequenceItems.length; i++) {
        const sequenceItem = storeRefs.current.sequenceItems[i];
        const distanceGroup = new paper.Group();
        distanceGroup.name = sequenceItem.uuid;

        //draw a line for each duration segment
        for (let j = 0; j < sequenceItem.durations.length; j++) {
          const width = sequenceItem.durations[j] * paperVars.pixelsPerSecond * 60; //duration is in minutes
          const itemLocYStart =
            paperVars.distanceGraphTop +
            paperVars.distanceGraphHeight -
            sequenceItem.distanceFromLander[j] * paperVars.pixelsPerMeter;
          //on traverses, there's always one more item in distanceFromLander array than the duration array
          //if we're on a station, just make the End equal to the Start
          const itemLocYEnd =
            sequenceItem.distanceFromLander.length - 1 > j
              ? paperVars.distanceGraphTop +
                paperVars.distanceGraphHeight -
                sequenceItem.distanceFromLander[j + 1] * paperVars.pixelsPerMeter
              : itemLocYStart;
          const graphLine = new paper.Path.Line({
            from: new paper.Point(itemLocX, itemLocYStart),
            to: new paper.Point(itemLocX + width, itemLocYEnd),
            strokeColor: paperRefs.current.styles.sequenceColor,
            strokeWidth: 1.5,
          });
          distanceGroup.addChild(graphLine);

          //draw first and last dots on the distance graph
          if (i === 0 && j === 0) {
            const diamond = new paper.Path.Rectangle({
              point: new paper.Point(itemLocX - 3, itemLocYStart - 3),
              size: 6,
              fillColor: paperRefs.current.styles.sequenceColor,
            });
            diamond.rotate(45);
            distanceGroup.addChild(diamond);
          }
          if (
            i === storeRefs.current.sequenceItems.length - 1 &&
            j === sequenceItem.durations.length - 1
          ) {
            const diamond = new paper.Path.Rectangle({
              point: new paper.Point(itemLocX + width - 3, itemLocYStart - 3),
              size: 6,
              fillColor: paperRefs.current.styles.sequenceColor,
            });
            diamond.rotate(45);
            distanceGroup.addChild(diamond);
          }
          paperRefs.current.landerDistance.push(distanceGroup);

          itemLocX += width; //increment x
        }
      }
    }

    //draws the EVA sequence - station boxes, traverses, and vertical time markers
    function drawSequence() {
      let itemLocX: number = paperVars.graphLeft;
      for (let i = 0; i < storeRefs.current.sequenceItems.length; i++) {
        const sequenceItem = storeRefs.current.sequenceItems[i];
        const sequenceItemGroup = new paper.Group();
        let width = 0;
        if (sequenceItem.type === "station") {
          //draw box
          width = paperVars.pixelsPerSecond * sequenceItem.durations[0] * 60;
          const stationBox = new paper.Rectangle(
            new paper.Point(itemLocX, paperVars.sequenceTop),
            new paper.Point(itemLocX + width, paperVars.sequenceTop + paperVars.sequenceHeight)
          );
          const stationBoxRounded = new paper.Path.Rectangle({
            rectangle: stationBox,
            radius: new paper.Size(5, 5),
            strokeColor: paperRefs.current.styles.sequenceColor,
            strokeWidth: 1.5,
          });

          //label
          const stationMiddleX = itemLocX + width / 2;
          const label = new paper.PointText({
            point: new paper.Point(stationMiddleX, paperVars.sequenceTop + 14),
            justification: "center",
            content: sequenceItem.name,
            fillColor: paperRefs.current.styles.sequenceColor,
          });
          //clip mask for station box
          const clipRectangle = new paper.Path.Rectangle(
            new paper.Point(itemLocX - 1, paperVars.sequenceTop - 1),
            new paper.Point(
              itemLocX + width + 1,
              paperVars.sequenceTop + paperVars.sequenceHeight + 1
            )
          );

          sequenceItemGroup.addChildren([clipRectangle, stationBoxRounded, label]);
          sequenceItemGroup.clipped = true;
        } else if (sequenceItem.type === "traverse") {
          width =
            paperVars.pixelsPerSecond *
            sequenceItem.durations.reduce(
              (accumulator, currentValue) => accumulator + currentValue,
              0
            ) *
            60;
          const traverseLine = new paper.Path.Line({
            from: new paper.Point(itemLocX, paperVars.sequenceTop + 10),
            to: new paper.Point(itemLocX + width, paperVars.sequenceTop + 10),
            strokeColor: paperRefs.current.styles.sequenceColor,
            strokeWidth: 1.5,
            dashArray: [5, 2],
          });
          sequenceItemGroup.addChild(traverseLine);
        }

        //add station or traverse group to the sequence array
        sequenceItemGroup.name = sequenceItem.uuid;
        paperRefs.current.evaSequence.push(sequenceItemGroup);

        //draw background rectangle (that turns yellow when selected) and add it to the paper refs
        const bkgRect = new paper.Path.Rectangle({
          rectangle: new paper.Rectangle(
            new paper.Point(itemLocX + 1, paperVars.graphTop + 1),
            new paper.Point(itemLocX + width - 1, paperVars.sequenceTop - 5)
          ),
          fillColor: paperRefs.current.styles.regularBkgColor,
          name: sequenceItem.uuid,
        });
        paperRefs.current.graphBkg.addChild(bkgRect);

        //move x-axis location
        itemLocX += width;

        //draw ending time marker and add it to the paper refs
        const markerColor =
          i === storeRefs.current.sequenceItems.length - 1
            ? paperRefs.current.styles.startEndHighlight
            : paperRefs.current.styles.lineColor;
        const timeMarkerEnd = drawTimeMarker(itemLocX, markerColor);
        timeMarkerEnd.name = sequenceItem.uuid;
        paperRefs.current.timeMarkers.addChild(timeMarkerEnd);
      }

      //draw "Available" block at the end of the sequence
      if (Math.round(itemLocX) < paperVars.graphLeft + paperVars.graphWidth) {
        const availableBox = new paper.Path.Rectangle({
          from: new paper.Point(itemLocX + 1, paperVars.graphTop + 1),
          to: new paper.Point(
            paperVars.graphLeft + paperVars.graphWidth - 1,
            paperVars.sequenceTop - 5
          ),
          fillColor: paperRefs.current.styles.availableBkgColor,
          name: "availableBox",
        });
        const availableMiddleX = (itemLocX + paperVars.graphLeft + paperVars.graphWidth) / 2;
        const seconds =
          (paperVars.graphLeft + paperVars.graphWidth - itemLocX) * paperVars.secondsPerPixel;
        const timeHrs = Math.floor(seconds / 3600);
        const timeMins = Math.round((seconds % 3600) / 60);
        const availableLabel = new paper.PointText({
          point: new paper.Point(availableMiddleX, paperVars.sequenceTop + 14),
          justification: "center",
          content: "Available (" + timeHrs + ":" + padZeros(timeMins, 2) + ")",
          fillColor: paperRefs.current.styles.sequenceColor,
          name: "availableLabel",
        });
        const group = new paper.Group();
        group.addChildren([availableBox, availableLabel]);
      }
    }

    /**
     * draws the vertical line wtih the rotated time at the bottom.
     * @param xLoc x location of the time marker
     * @param customColor optional color to draw the line with
     * @returns a paper group containing the line and time text
     */
    function drawTimeMarker(xLoc: number, customColor: paper.Color = null): paper.Group {
      const markerGroup = new paper.Group();
      const color = customColor || paperRefs.current.styles.lineColor;
      const verticalLine = new paper.Path.Line({
        from: new paper.Point(xLoc, paperVars.graphTop),
        to: new paper.Point(xLoc, paperVars.graphTop + paperVars.graphHeight),
        strokeColor: color,
        strokeWidth: 1,
      });
      verticalLine.name = "lineMarker";
      const seconds = (xLoc - paperVars.graphLeft) * paperVars.secondsPerPixel;
      const timeHrs = Math.floor(seconds / 3600);
      const timeMins = Math.round((seconds % 3600) / 60);
      const timeLabel = new paper.PointText({
        point: new paper.Point(xLoc + 4, paperVars.graphTop + paperVars.graphHeight + 30),
        justification: "left",
        fontFamily: paperRefs.current.styles.gNavigatorFontFamilyActivity,
        fontSize: 12,
        fillColor: color,
        content: timeHrs + ":" + padZeros(timeMins, 2),
      });
      timeLabel.rotate(
        -90,
        new paper.Point(xLoc + 4, paperVars.graphTop + paperVars.graphHeight + 30)
      );
      markerGroup.addChildren([timeLabel]);
      return markerGroup;
    }

    //draws the y axis meter ticks
    function drawMeterMarker(yLoc: number, label: string): paper.Group {
      const markerGroup = new paper.Group();
      const horizontalLine = new paper.Path.Line({
        from: new paper.Point(paperVars.graphLeft - 10, yLoc),
        to: new paper.Point(paperVars.graphLeft, yLoc),
        strokeColor: paperRefs.current.styles.lineColor,
        strokeWidth: 1,
      });
      const meterLabel = new paper.PointText({
        point: new paper.Point(paperVars.graphLeft - 15, yLoc + 4),
        justification: "right",
        fontFamily: paperRefs.current.styles.gNavigatorFontFamilyActivity,
        fontSize: 12,
        fillColor: paperRefs.current.styles.sequenceColor,
        content: label + " m",
      });
      markerGroup.addChildren([horizontalLine, meterLabel]);
      return markerGroup;
    }

    //draw all the things
    drawGraphAxis();
    if (selectedEva) {
      drawSequence();
      drawLanderDistanceGraph();
      highlightSelection();
    }
  }, [highlightSelection, paperRefs, selectedEva]);

  // Initialize the timeline on first render
  useLayoutEffect(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }
    loadUseRefs();
    drawTimeline();

    //event handlers
    // paper.view.onMouseMove = (event) => {};
    // paper.view.onMouseUp = (event) => {};
    // paper.view.onMouseLeave = (event) => {};
    paper.view.onResize = function () {
      drawTimeline();
    };

    return () => paper.project.remove();
  }, [selectedEva, loadUseRefs, storeRefs, drawTimeline]);

  //sets the stroke or fill color for an array of paper items
  function setColorForItems(group: paper.Item[], customColor: paper.Color = null) {
    for (const child of group) {
      if (child.hasStroke()) child.strokeColor = customColor;
      if (child.hasFill()) child.fillColor = customColor;
    }
  }

  return (
    <>
      <div className={styles.canvasContainer}>
        <canvas ref={canvas} data-paper-resize />
      </div>
    </>
  );
};

export default NavTimeline;

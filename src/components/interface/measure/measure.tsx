import type { MutableRefObject, FunctionComponent } from "react";
import { useRef, useLayoutEffect, useCallback, useEffect, useState } from "react";
import styles from "./measure.module.css";
import MeasureHoverValues from "./measure-hover";
import MeasureTabs from "./measure-tabs";
import paper from "paper";
import * as MeasureDrawing from "./measure-drawing";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { PathColorPickerMenu, Button } from "../form/globalFields";
import { upsertMeasurementByField } from "store/measure";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { updateMapDirective } from "store/map";
import throttle from "lodash/throttle";
import isNil from "lodash/isNil";
import { clearMapItemHover } from "store/hover";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  buildDistanceElevationProfile,
  buildDistanceTerrainSlopeProfile,
  calculateWindowedPathSlopes,
} from "utils/paper";
import SlopeLegend from "../slope-legend";

const initHoverValues: MeasureHoverValues = {
  totalDistanceMeters: null,
  distanceFromStartMeters: null,
  elevationMeters: null,
  pathGradeDegrees: null,
  terrainSlopeDegrees: null,
};

const Measure: FunctionComponent = () => {
  const selectedMeasurement = useAppSelector(
    (state) =>
      state.measure.measurements.find(
        (measurement) => measurement.uuid === state.measure.selectedMeasurementUuid
      ),
    deepEqual
  );
  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === selectedMeasurement?.uuid
      ? state.map.mapDirective
      : null;
  }, deepEqual);

  const usingLGRSCoordinates = useMissionDocSelector(
    (mission) => mission.usingLGRSCoordinates,
    refEqual
  );

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;
  const slopeColorMode = useAppSelector((state) => state.interface.slopeColorMode, refEqual);

  const [hoverValues, setHoverValues] = useState<MeasureHoverValues>(initHoverValues);

  const dispatch = useAppDispatch();
  const measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups> = useRef(null);
  const measurePaperDataRef: MutableRefObject<MeasurePaperData> = useRef(null);
  const measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues> = useRef({
    startElevationMeters: null,
    maxElevationMeters: null,
    minElevationMeters: null,
    relativeElevationsMeters: null,
    elevationGraphValues: null,
    terrainSlopeGraphValues: null,
    totalDistanceMeters: null,
  });
  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);

  //handles on mouse move over the paper canvas
  const onMouseMove = (event: paper.MouseEvent) => {
    MeasureDrawing.drawMouseHover(
      dispatch,
      measurePaperDataRef,
      measurePaperGroupsRef,
      measureDerivedValuesRef,
      event.point,
      setHoverValues,
      selectedMeasurement?.uuid
    );
  };

  const drawMeasurement = useCallback(async () => {
    //clear the paper project
    paper.project.clear();

    if (!selectedMeasurement) {
      paper.view.update();
      return;
    }

    //init paper refs
    initMeasurePaperRefs(
      measurePaperDataRef,
      measurePaperGroupsRef,
      measureDerivedValuesRef,
      selectedMeasurement?.pathSegmentDistances,
      selectedMeasurement?.pathSegmentElevations,
      selectedMeasurement?.pathSegmentAbsoluteSlopes ?? null
    );

    setHoverValues({
      ...initHoverValues,
      totalDistanceMeters: measureDerivedValuesRef.current.totalDistanceMeters,
    });

    //draw the axes
    MeasureDrawing.drawGraphAxes(
      measurePaperDataRef,
      measurePaperGroupsRef,
      measureDerivedValuesRef
    );
    MeasureDrawing.drawElevationProfile(measurePaperDataRef, measureDerivedValuesRef);
    MeasureDrawing.drawPathSlope(
      measurePaperDataRef,
      measurePaperGroupsRef,
      measureDerivedValuesRef,
      slopeColorMode
    );
    MeasureDrawing.drawTerrainSlope(
      measurePaperDataRef,
      measurePaperGroupsRef,
      measureDerivedValuesRef,
      slopeColorMode
    );

    //draw the line segment marks
    MeasureDrawing.drawMeasureSegmentDistances(
      measurePaperDataRef,
      measurePaperGroupsRef,
      selectedMeasurement?.pathSegmentDistances,
      selectedMeasurement?.pathSegmentBearings,
      usingLGRSCoordinates
    );
  }, [selectedMeasurement, setHoverValues, slopeColorMode, usingLGRSCoordinates]);

  // Draw the timeline when the measure uuid changes
  useEffect(() => {
    drawMeasurement();
  }, [selectedMeasurement, drawMeasurement]);

  // Initialize the timeline on first render
  useLayoutEffect(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }

    paper.view.onResize = function () {
      drawMeasurement();
    };

    paper.view.onMouseMove = throttle(onMouseMove, 15, {
      leading: true,
      trailing: false,
    });

    paper.view.onMouseLeave = () => {
      if (measurePaperGroupsRef.current?.hoverGroup)
        measurePaperGroupsRef.current.hoverGroup.visible = false;
      dispatch(clearMapItemHover());

      //clear hover values
      setHoverValues({
        ...initHoverValues,
        totalDistanceMeters: measureDerivedValuesRef.current.totalDistanceMeters,
      });
    };

    return () => paper.project.remove();
    //eslint-disable-next-line
  }, [drawMeasurement]);

  const handlePathEdit = () => {
    dispatch(
      updateMapDirective({
        uuid: selectedMeasurement.uuid,
        mapItemType: "measurement",
        mapAction: "editPolyline",
      })
    );
  };

  const handlePathFinished = async () => {
    dispatch(
      thunkUpdateMapDirective({
        uuid: selectedMeasurement.uuid,
        mapItemType: "measurement",
        mapAction: "saveEditPolyline",
      })
    );
  };

  return (
    <div className={styles.measureContainer}>
      <div className={styles.measureBodyContainer}>
        <div className={styles.measureBodyLeftContainer}>
          {selectedMeasurement && (
            <>
              <div className={styles.panelButtonsContainer} style={{ marginBottom: "4px" }}>
                <PathColorPickerMenu
                  currentColor={selectedMeasurement?.color}
                  editMode={mapAction === null}
                  direction={"right"}
                  updateColor={(val) => {
                    dispatch(upsertMeasurementByField(selectedMeasurement.uuid, "color", val));
                  }}
                  styleContainer={{
                    padding: "0px 5px 0px 5px",
                    width: "75px",
                  }}
                />
                {mapAction === null ? (
                  <>
                    <Button
                      onClick={() => {
                        handlePathEdit();
                      }}
                      label="Edit Path on Map"
                      style={{ width: "115px" }}
                    />
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      handlePathFinished();
                    }}
                    label="Finished"
                    style={{ width: "75px" }}
                  />
                )}
              </div>
              <MeasureHoverValues hoverValues={hoverValues} />
              <SlopeLegend />
            </>
          )}
        </div>
        <div className={styles.measureBodyRightContainer}>
          <MeasureTabs />
          <div className={styles.measureCanvasContainer}>
            <canvas ref={canvas} data-paper-resize />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Measure;

function initMeasurePaperRefs(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measurePaperGroupsRef: MutableRefObject<MeasurePaperGroups>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>,
  pathSegmentDistances: number[],
  pathSegmentElevations: number[][],
  pathSegmentAbsoluteSlopes: (number | null)[][] | null
): void {
  //init groups
  measurePaperGroupsRef.current = {
    axisGroup: new paper.Group(),
    pathGradeGroup: new paper.Group(),
    terrainSlopeGroup: new paper.Group(),
    lineSegmentMarksGroup: new paper.Group(),
    hoverGroup: new paper.Group(),
  };

  //init paper vars and styles
  measurePaperDataRef.current = {
    styles: {
      gNavigatorFontFamilyActivity: "Inter",
      blue: new paper.Color("#93AFD7"),
      brightBlue: new paper.Color("#00C2FF"),
      green: new paper.Color("#8fae95"),
      brightGreen: new paper.Color("#52f075"),
      yellow: new paper.Color("#ffc700"),
      lightYellow: new paper.Color("#41403B"),
      grey1: new paper.Color("#313440"),
      grey2: new paper.Color("#424653"),
      grey3: new paper.Color("#616574"),
      grey4: new paper.Color("#a9a9a9"),
      grey5: new paper.Color("#d3d3d3"),
      white: new paper.Color("#e0e0e0"),
      red: new paper.Color("#FC5454"),
    },
    paperVars: {
      canvasWidth: paper.view.size.width, //full drawing area
      canvasHeight: paper.view.size.height,
      drawingHeight: null, //just the drawing drawing area
      drawingWidth: null,
      drawingTop: null,
      drawingLeft: null,
      graphHeight: null, //just the graph area that has the line graphs
      pathGradeTop: null,
      pathGradeHeight: 10,
      terrainSlopeTop: null,
      terrainSlopeHeight: 10,
      pixelsPerMeterDistanceX: null,
      pixelsPerMeterElevationY: null,
      startElevationFromGraphTop: null,
    },
  };

  // calculate derived values
  // make elevations relative to the start elevation
  // Guard against null/undefined elevations (e.g. during drag before elevation fetch completes)
  const safeElevations = pathSegmentElevations ?? [];
  const startElevation = safeElevations.length > 0 ? safeElevations[0][0] : 0;
  measureDerivedValuesRef.current.relativeElevationsMeters = safeElevations.map((segment) =>
    segment.map((elevation) => elevation - startElevation)
  );

  //find max/min of elevation
  measureDerivedValuesRef.current.startElevationMeters = 0;
  measureDerivedValuesRef.current.maxElevationMeters = null;
  measureDerivedValuesRef.current.minElevationMeters = null;

  for (const elevationSegment of measureDerivedValuesRef.current.relativeElevationsMeters) {
    for (const elevation of elevationSegment) {
      if (
        !measureDerivedValuesRef.current.maxElevationMeters ||
        measureDerivedValuesRef.current.maxElevationMeters < elevation
      ) {
        measureDerivedValuesRef.current.maxElevationMeters = elevation;
      }
      if (
        !measureDerivedValuesRef.current.minElevationMeters ||
        measureDerivedValuesRef.current.minElevationMeters > elevation
      ) {
        measureDerivedValuesRef.current.minElevationMeters = elevation;
      }
    }
  }

  measureDerivedValuesRef.current.totalDistanceMeters =
    pathSegmentDistances?.reduce((a, b) => a + b, 0) ?? 0;

  //calculate paper vars. These are pixel and spacing variables that help determine where to draw things
  const paperVars = measurePaperDataRef.current.paperVars; //save this to a shorter reference so it reduces the variable name when used below

  const yAxisLabelWidth = 85;
  paperVars.drawingWidth = paperVars.canvasWidth - yAxisLabelWidth;
  paperVars.drawingHeight = paperVars.canvasHeight - 20;
  paperVars.drawingTop = 10;
  paperVars.drawingLeft = 10;
  const slopeAreaHeight = 30;
  paperVars.graphHeight = paperVars.drawingHeight - paperVars.drawingTop - slopeAreaHeight;
  paperVars.pathGradeTop = paperVars.drawingTop + paperVars.graphHeight;
  paperVars.terrainSlopeTop = paperVars.pathGradeTop + paperVars.pathGradeHeight;
  paperVars.pixelsPerMeterDistanceX =
    measureDerivedValuesRef.current.totalDistanceMeters > 0
      ? paperVars.drawingWidth / measureDerivedValuesRef.current.totalDistanceMeters
      : 1;
  const elevationRange =
    (measureDerivedValuesRef.current.maxElevationMeters ?? 0) -
    (measureDerivedValuesRef.current.minElevationMeters ?? 0);
  paperVars.pixelsPerMeterElevationY =
    elevationRange > 0 ? paperVars.graphHeight / elevationRange : 1;

  paperVars.startElevationFromGraphTop =
    ((measureDerivedValuesRef.current.maxElevationMeters ?? 0) -
      measureDerivedValuesRef.current.startElevationMeters) *
    paperVars.pixelsPerMeterElevationY;

  measureDerivedValuesRef.current.elevationGraphValues = calcElevationGraphValues(
    measurePaperDataRef,
    measureDerivedValuesRef,
    pathSegmentDistances,
    paperVars.drawingLeft
  );
  measureDerivedValuesRef.current.terrainSlopeGraphValues = calcTerrainSlopeGraphValues(
    pathSegmentAbsoluteSlopes,
    pathSegmentElevations,
    pathSegmentDistances,
    paperVars.drawingLeft,
    paperVars.pixelsPerMeterDistanceX
  );
}

export function calcTerrainSlopeGraphValues(
  segmentedSlopes: (number | null)[][] | null,
  segmentedElevations: number[][] | null,
  segmentDistances: number[],
  xLocStart: number,
  pixelsPerMeter: number
): GraphDataItem[] {
  return buildDistanceTerrainSlopeProfile(
    segmentedSlopes,
    segmentDistances ?? [],
    segmentedElevations
  ).map(({ distanceMeters, slopeDegrees }) => ({
    xPixel: xLocStart + distanceMeters * pixelsPerMeter,
    yPixel: 0,
    val: slopeDegrees ?? 0,
    distanceMeters,
    slopeDegrees,
  }));
}

function calcElevationGraphValues(
  measurePaperDataRef: MutableRefObject<MeasurePaperData>,
  measureDerivedValuesRef: MutableRefObject<MeasureDerivedValues>,
  pathSegmentDistances: number[],
  xLocStart: number
): GraphDataItem[] {
  const paperVars = measurePaperDataRef.current.paperVars;
  const pathSegmentElevations = measureDerivedValuesRef.current.relativeElevationsMeters;
  const graphData_elevation: GraphDataItem[] = [];
  if (!pathSegmentElevations || pathSegmentElevations.length === 0) return graphData_elevation;
  const profile = buildDistanceElevationProfile(pathSegmentElevations, pathSegmentDistances ?? []);
  const slopes = calculateWindowedPathSlopes(profile);

  for (const [index, { distanceMeters, elevationMeters }] of profile.entries()) {
    graphData_elevation.push({
      xPixel: xLocStart + distanceMeters * paperVars.pixelsPerMeterDistanceX,
      yPixel:
        paperVars.drawingTop +
        (measureDerivedValuesRef.current.maxElevationMeters - elevationMeters) *
          paperVars.pixelsPerMeterElevationY,
      val: elevationMeters,
      distanceMeters,
      slopeDegrees: slopes[index],
    });
  }
  return graphData_elevation;
}

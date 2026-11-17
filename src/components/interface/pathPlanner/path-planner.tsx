import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";

import measureStyles from "../measure/measure.module.css";
import styles from "./pathPlanner.module.css";
import PathPlannerTabs from "./path-planner-tabs";
import { Button, PathColorPickerMenu } from "../form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { updateMapDirective } from "store/map";
import { setPathPlanColor } from "store/pathPlanner";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import {
  NEWTON_DEFAULT_SLOPE_LIMIT,
  thunkFlushPathPlan,
  thunkRetryPathPlan,
  thunkUpdatePathPlanParams,
} from "store/thunk/thunkPathPlanner";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { formatLatLng } from "utils/coordinateEntry";
import { formatLgrsFromLatLon, LGRS_DISPLAY_PRECISION_METERS } from "utils/lgrs/display";
import { isPathPlanRowCurrent } from "utils/pathPlanner";

/** The panel's status line for a plan. */
export function pathPlanStatusLabel(plan: PathPlan): string {
  const { status, row, error } = plan.request;
  if (error) return error.message;
  switch (status) {
    case "idle":
      return plan.pointsTouched
        ? "Move the start and goal apart"
        : "Drag S or G on the map to plan a path";
    case "debouncing":
      return "Waiting…";
    case "pending":
      return row?.status === "queued" || row?.status === "submitting" ? "Queued" : "Planning…";
    case "ready":
      return "Ready";
    default:
      return "";
  }
}

const formatMeters = (meters: number) => `${Math.round(meters).toLocaleString()} m`;

/** e.g. "+38 m, +12 %" */
export function formatLengthDifference(pathMeters: number, straightMeters: number): string {
  const diff = pathMeters - straightMeters;
  const sign = diff >= 0 ? "+" : "−";
  const percent = straightMeters > 0 ? Math.round((Math.abs(diff) / straightMeters) * 100) : 0;
  return `${sign}${Math.round(Math.abs(diff)).toLocaleString()} m, ${sign}${percent} %`;
}

/** Parses the slope limit field; empty is the default limit, null is invalid. */
export function parseSlopeLimit(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return NEWTON_DEFAULT_SLOPE_LIMIT;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 && value <= 90 ? value : null;
}

const SlopeLimitField: FunctionComponent<{ plan: PathPlan; enabled: boolean }> = ({
  plan,
  enabled,
}) => {
  const dispatch = useAppDispatch();
  const stored = plan.params.slopeLimit ?? NEWTON_DEFAULT_SLOPE_LIMIT;
  const [text, setText] = useState(String(stored));
  useEffect(() => setText(String(stored)), [stored, plan.uuid]);
  const parsed = parseSlopeLimit(text);

  const commit = () => {
    if (parsed === null) return;
    setText(String(parsed));
    dispatch(
      thunkUpdatePathPlanParams({ uuid: plan.uuid, params: { ...plan.params, slopeLimit: parsed } })
    );
  };

  return (
    <label className={styles.slopeLimit}>
      <span>Slope limit (°)</span>
      <input
        className={`${styles.slopeLimitInput} ${parsed === null ? styles.slopeLimitInvalid : ""}`}
        aria-label="Slope limit (degrees)"
        inputMode="decimal"
        value={text}
        disabled={!enabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
};

/** Lat/lng, and LGRS when the point has an LGRS coordinate. */
const PathPlanPoint: FunctionComponent<{
  label: string;
  point: AEGISPoint;
  dynamicLgrs: boolean;
}> = ({ label, point, dynamicLgrs }) => {
  const lgrs = formatLgrsFromLatLon(
    point,
    LGRS_DISPLAY_PRECISION_METERS,
    dynamicLgrs ? "full" : "condensed"
  );
  return (
    <div className={styles.summaryRow} data-testid={`path-plan-point-${label.toLowerCase()}`}>
      <span className={styles.summaryTitle}>{label}</span>
      <span className={styles.pointValues}>
        <span>{formatLatLng(point)}</span>
        <span>LGRS {lgrs ?? "—"}</span>
      </span>
    </div>
  );
};

const PathPlanSummary: FunctionComponent<{ plan: PathPlan }> = ({ plan }) => {
  const planetRadius = useMissionDocSelector((mission) => mission.planetRadius, refEqual);
  const dynamicLgrs = useMissionDocSelector(
    (mission) => mission.gridRenderMode === "dynamic-lgrs",
    refEqual
  );
  const straightMeters = getDistanceBetweenTwoCoordinates(plan.start, plan.goal, planetRadius) ?? 0;
  const row = plan.request.row;
  const current = isPathPlanRowCurrent(plan, planetRadius);
  const pathMeters =
    current && row?.status === "succeeded" && row.segmentDistances
      ? row.segmentDistances.reduce((sum, meters) => sum + meters, 0)
      : null;

  // The slope limit Newton used for the path shown, which may be older than the field.
  const pathSlopeLimit = row ? (row.params?.slopeLimit ?? NEWTON_DEFAULT_SLOPE_LIMIT) : null;

  return (
    <div className={styles.summary} data-testid="path-plan-summary">
      <PathPlanPoint label="Start" point={plan.start} dynamicLgrs={dynamicLgrs} />
      <PathPlanPoint label="Goal" point={plan.goal} dynamicLgrs={dynamicLgrs} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryTitle}>Straight line</span>
        <span>{formatMeters(straightMeters)}</span>
      </div>
      <div className={styles.summaryRow}>
        <span className={styles.summaryTitle}>A* path</span>
        <span>{pathMeters == null ? "—" : formatMeters(pathMeters)}</span>
      </div>
      {pathSlopeLimit != null && (
        <div className={styles.summaryRow} data-testid="path-plan-slope-limit">
          <span className={styles.summaryTitle}>Path slope limit</span>
          <span>
            {pathSlopeLimit}°{current ? "" : " (older path)"}
          </span>
        </div>
      )}
      {pathMeters != null && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryTitle}>Difference</span>
          <span>{formatLengthDifference(pathMeters, straightMeters)}</span>
        </div>
      )}
      {current && row?.mapInfo?.length ? (
        <div className={styles.summaryRow}>
          <span className={styles.summaryTitle}>Slope map</span>
          <span>{row.mapInfo.map((info) => info.name).join(", ")}</span>
        </div>
      ) : null}
      {current && row?.runtimeMs != null && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryTitle}>Planning time</span>
          <span>{(row.runtimeMs / 1000).toFixed(1)} s</span>
        </div>
      )}
    </div>
  );
};

const PathPlanner: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const plan = useAppSelector(
    (state) =>
      state.pathPlanner.plans.find((item) => item.uuid === state.pathPlanner.selectedPlanUuid),
    deepEqual
  );
  const editing = useAppSelector(
    (state) =>
      !!plan &&
      state.map.mapDirective?.uuid === plan.uuid &&
      state.map.mapDirective?.mapAction === "editPolyline",
    refEqual
  );

  const status = plan ? pathPlanStatusLabel(plan) : "";
  const failed = !!plan?.request.error;

  return (
    <div className={measureStyles.measureContainer}>
      <div className={measureStyles.measureBodyContainer}>
        <div className={`${measureStyles.measureBodyLeftContainer} ${styles.leftColumn}`}>
          {plan && (
            <>
              <div className={measureStyles.panelButtonsContainer}>
                <PathColorPickerMenu
                  currentColor={plan.color}
                  editMode={!editing}
                  direction={"right"}
                  updateColor={(color) => dispatch(setPathPlanColor({ uuid: plan.uuid, color }))}
                  styleContainer={{ padding: "0px 5px 0px 5px", width: "75px" }}
                />
                {editing ? (
                  <Button
                    label="Finished"
                    style={{ width: "75px" }}
                    onClick={() => {
                      dispatch(
                        thunkUpdateMapDirective({
                          uuid: plan.uuid,
                          mapItemType: "pathPlan",
                          mapAction: "saveEditPolyline",
                        })
                      );
                      dispatch(thunkFlushPathPlan({ uuid: plan.uuid }));
                    }}
                  />
                ) : (
                  <Button
                    label="Edit Points on Map"
                    style={{ width: "125px" }}
                    onClick={() =>
                      dispatch(
                        updateMapDirective({
                          uuid: plan.uuid,
                          mapItemType: "pathPlan",
                          mapAction: "editPolyline",
                        })
                      )
                    }
                  />
                )}
              </div>
              <SlopeLimitField plan={plan} enabled={!editing} />
            </>
          )}
        </div>
        <div className={measureStyles.measureBodyRightContainer}>
          <PathPlannerTabs />
          <div className={`${measureStyles.measureCanvasContainer} ${styles.body}`}>
            {plan ? (
              <>
                <div
                  className={`${styles.status} ${failed ? styles.statusError : ""}`}
                  role="status"
                  data-testid="path-plan-status"
                >
                  <span>{status}</span>
                  {failed && plan.request.error.retryable && (
                    <Button
                      label="Retry"
                      size="xs"
                      onClick={() => dispatch(thunkRetryPathPlan({ uuid: plan.uuid }))}
                    />
                  )}
                </div>
                <PathPlanSummary plan={plan} />
              </>
            ) : (
              <div className={styles.empty}>
                Add a plan with + to see Newton&apos;s A* path between two points.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PathPlanner;

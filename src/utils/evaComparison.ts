import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import { resolveCampaignExecutionRexes } from "utils/evaReportColumns";
import {
  calcPathDurationMins,
  getDistanceBetweenTwoCoordinates,
  getTotalDistance,
} from "utils/mapping/geoMath";

/**
 * Pure computation module for the "EVA Comparison" report.
 *
 * Everything here is a plain function over `mission` + an `EvaReportColumn`
 * (from evaReportColumns.ts) — no React, no Redux, no Automerge handles; same
 * style as stmEvaCoverage.ts. Metric values are keyed by a stable metric-row id
 * (see EVA_COMPARISON_METRIC_ROWS) so the UI can render a fixed left axis.
 *
 * Plan-derived metrics (time / distance / work groups) are sourced from the
 * existing pure calculators in calculatedFields.ts / geoMath.ts. REX-only
 * metrics come from the Rex doc entity. No calculator used here performs
 * elevation fetches or any other I/O; all inputs are raw mission-doc fields.
 *
 * Types (EvaReportColumn, EvaComparisonMetricRow, ...) are declared ambiently
 * in typings/stm.d.ts and typings/evaComparison.d.ts.
 */

/** Action/entry masses are stored in grams; sample-mass rows report kilograms. */
const GRAMS_PER_KG = 1000;

/** Fallback planet radius (Moon, metres) when a mission has none set. */
const DEFAULT_PLANET_RADIUS_METERS = 1737400;

/**
 * The ordered metric rows of the comparison table, grouped by section. `id`s are
 * stable and load-bearing (UI + Redux keys). `aggregation` controls how campaign
 * columns combine member values; `rexOnly` rows are null for plan columns.
 */
export const EVA_COMPARISON_METRIC_ROWS: EvaComparisonMetricRow[] = [
  // ---- Time (minutes) ----
  {
    id: "totalEvaTimeCalculated",
    label: "Total EVA time (calculated)",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "allottedEvaTime",
    label: "Total EVA time (allotted)",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "evaTimeMargin",
    label: "EVA time margin (allotted − calculated)",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "totalTraverseTime",
    label: "Traverse time",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "dwellEv1",
    label: "Dwell time EV1",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "dwellEv2",
    label: "Dwell time EV2",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "dwellUnassigned",
    label: "Dwell time unassigned",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "totalDwellTime",
    label: "Total dwell time (max EV1/EV2)",
    group: "time",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  // ---- Distance (metres, except walkback duration) ----
  {
    id: "totalTraverseDistance",
    label: "Total traverse distance",
    group: "distance",
    unit: "m",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "totalAscent",
    label: "Total ascent",
    group: "distance",
    unit: "m",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "totalDescent",
    label: "Total descent",
    group: "distance",
    unit: "m",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "maxDistanceFromLander",
    label: "Max distance from lander",
    group: "distance",
    unit: "m",
    rexOnly: false,
    aggregation: "max",
  },
  {
    id: "worstCaseWalkbackDuration",
    label: "Worst-case station walkback duration",
    group: "distance",
    unit: "min",
    rexOnly: false,
    aggregation: "max",
  },
  // ---- Work ----
  {
    id: "stationCount",
    label: "Station count",
    group: "work",
    unit: "",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "actionCount",
    label: "Action count",
    group: "work",
    unit: "",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "totalActionTime",
    label: "Total action time",
    group: "work",
    unit: "min",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "plannedSampleMass",
    label: "Planned sample mass",
    group: "work",
    unit: "kg",
    rexOnly: false,
    aggregation: "sum",
  },
  {
    id: "singleUseConsumablesCount",
    label: "Single-use consumables",
    group: "work",
    unit: "",
    rexOnly: false,
    aggregation: "sum",
  },
  // ---- REX-only (blank/null for plan columns) ----
  {
    id: "actualSampleMass",
    label: "Actual sample mass",
    group: "rexOnly",
    unit: "kg",
    rexOnly: true,
    aggregation: "sum",
  },
  {
    id: "actionsCompleteCount",
    label: "Actions complete",
    group: "rexOnly",
    unit: "",
    rexOnly: true,
    aggregation: "sum",
  },
  {
    id: "actionsSkippedCount",
    label: "Actions skipped",
    group: "rexOnly",
    unit: "",
    rexOnly: true,
    aggregation: "sum",
  },
  {
    id: "actualDistanceWalked",
    label: "Actual distance walked",
    group: "rexOnly",
    unit: "m",
    rexOnly: true,
    aggregation: "sum",
  },
];

/**
 * Max, over an EVA's station locations and traverse path points, of the
 * great-circle distance to the mission lander. Mirrors the max-distance-from-
 * lander pattern in common-timeline.ts (~L144-154). Returns 0 when there is no
 * lander location or no usable points.
 */
export const getMaxDistanceFromLander = (mission: Mission, evaUuid: string): number => {
  const landerLocation = mission?.landerLocation;
  if (!landerLocation || landerLocation.lat == null || landerLocation.lng == null) return 0;
  const radius = mission?.planetRadius ?? DEFAULT_PLANET_RADIUS_METERS;

  const points: AEGISPoint[] = [];
  for (const station of selectEvaStations(mission, evaUuid)) {
    if (station.location) points.push(station.location);
  }
  for (const traverse of selectEvaTraverses(mission, evaUuid)) {
    for (const point of traverse.path ?? []) {
      if (point) points.push(point);
    }
  }

  let maxDistance = 0;
  for (const point of points) {
    const distance = getDistanceBetweenTwoCoordinates(point, landerLocation, radius);
    if (distance != null && distance > maxDistance) maxDistance = distance;
  }
  return maxDistance;
};

/**
 * Actual distance walked during a REX: the total great-circle length of the
 * REX's recorded position track (`rex.posEntries[].location`), in metres.
 * `planetRadius` defaults to the Moon radius so callers may invoke as
 * `getActualDistanceWalked(rex)`; computeComparisonColumnValues passes the
 * mission's radius.
 */
export const getActualDistanceWalked = (
  rex: Rex,
  planetRadius: number = DEFAULT_PLANET_RADIUS_METERS
): number => {
  const points = (rex?.posEntries ?? [])
    .map((posEntry) => posEntry.location)
    .filter(
      (location): location is AEGISPoint =>
        !!location && location.lat != null && location.lng != null
    );
  if (points.length < 2) return 0;
  return getTotalDistance(points, planetRadius);
};

/** Worst-case (longest) station walkback duration across an EVA's stations, in minutes. */
const getWorstCaseWalkbackDuration = (mission: Mission, evaUuid: string): number => {
  let worst = 0;
  for (const station of selectEvaStations(mission, evaUuid)) {
    const rate = station.walkbackTraverseRate
      ? station.walkbackTraverseRate
      : mission?.walkbackRate;
    const duration = calcPathDurationMins(station.walkbackPathSegmentDistances, rate);
    if (duration > worst) worst = duration;
  }
  return worst;
};

/** Count of single-use equipment items consumed, from a merged EquipmentItemUsages. */
const countSingleUseConsumables = (
  mission: Mission,
  usages: EquipmentItemUsages | null | undefined
): number => {
  let count = 0;
  for (const [uuid, usage] of Object.entries(usages ?? {})) {
    if (mission?.equipmentItems?.[uuid]?.singleUse) count += usage.quantityUsed;
  }
  return count;
};

/**
 * Plan-derived (non-REX-only) metric values for a single EVA, keyed by metric
 * row id. Returns {} when the EVA no longer exists. Sample mass is converted
 * from the app's native grams to kilograms for a compact cell display.
 */
const computePlanMetrics = (mission: Mission, evaUuid: string): EvaComparisonColumnValues => {
  const eva = mission?.evas?.[evaUuid];
  if (!eva) return {};

  const calc = getCalculatedFieldsByEva({
    eva,
    evaStations: selectEvaStations(mission, evaUuid),
    missionWalkbackRate: mission.walkbackRate,
    missionTraverseRate: mission.traverseRate,
    evaActions: Object.values(mission.actions ?? {}),
    evaTraverses: selectEvaTraverses(mission, evaUuid),
  });
  if (!calc) return {};

  return {
    totalEvaTimeCalculated: calc.totalEvaTime,
    allottedEvaTime: eva.duration ?? null,
    evaTimeMargin: eva.duration != null ? eva.duration - calc.totalEvaTime : null,
    totalTraverseTime: calc.totalTraverseTime,
    dwellEv1: calc.totalEv1Time,
    dwellEv2: calc.totalEv2Time,
    dwellUnassigned: calc.totalUnassignedTime,
    totalDwellTime: calc.totalDwellTime,
    totalTraverseDistance: calc.totalTraverseDistanceMeters,
    totalAscent: calc.totalTraverseAscentDescent.totalMetersClimbed,
    totalDescent: calc.totalTraverseAscentDescent.totalMetersDescended,
    maxDistanceFromLander: getMaxDistanceFromLander(mission, evaUuid),
    worstCaseWalkbackDuration: getWorstCaseWalkbackDuration(mission, evaUuid),
    stationCount: selectEvaStations(mission, evaUuid).length,
    actionCount: calc.actionCount,
    totalActionTime: calc.totalActionTime,
    plannedSampleMass: calc.totalMass / GRAMS_PER_KG,
    singleUseConsumablesCount: countSingleUseConsumables(mission, calc.equipmentItems),
  };
};

/** REX-only metric values for a single REX, keyed by metric row id. */
const computeRexMetrics = (rex: Rex, planetRadius: number): EvaComparisonColumnValues => {
  let actualSampleMass = 0;
  let actionsCompleteCount = 0;
  let actionsSkippedCount = 0;
  for (const entry of Object.values(rex.actionEntries ?? {})) {
    if (typeof entry.mass === "number") actualSampleMass += entry.mass;
    if (entry.rexStatus === "complete") actionsCompleteCount += 1;
    if (entry.rexStatus === "skipped") actionsSkippedCount += 1;
  }
  return {
    actualSampleMass: actualSampleMass / GRAMS_PER_KG,
    actionsCompleteCount,
    actionsSkippedCount,
    actualDistanceWalked: getActualDistanceWalked(rex, planetRadius),
  };
};

/** Sum or max over the non-null values; null when there are no values. */
const aggregate = (values: (number | null)[], mode: "sum" | "max"): number | null => {
  const nums = values.filter((value): value is number => value != null);
  if (nums.length === 0) return null;
  return mode === "max"
    ? Math.max(...nums)
    : nums.reduce((accumulator, value) => accumulator + value, 0);
};

/**
 * Per-metric-row values for one report column. Handles every EvaReportColumn
 * kind:
 *  - "eva"  — plan metrics for one EVA; REX-only rows null.
 *  - "rex"  — plan metrics for the REX's EVA copy + REX-only rows from the Rex.
 *  - "campaignPlanned"  — aggregate plan metrics over surviving member EVAs.
 *  - "campaignExecuted" — aggregate plan + REX-only metrics over the resolved
 *    execution REXes.
 * Missing EVAs/REXes are skipped. Aggregation (sum/max) is per metric row.
 */
export const computeComparisonColumnValues = ({
  mission,
  column,
}: {
  mission: Mission;
  column: EvaReportColumn;
}): EvaComparisonColumnValues => {
  const planetRadius = mission?.planetRadius ?? DEFAULT_PLANET_RADIUS_METERS;
  const values: EvaComparisonColumnValues = {};

  if (column.kind === "eva") {
    const plan = column.evaUuid ? computePlanMetrics(mission, column.evaUuid) : {};
    for (const row of EVA_COMPARISON_METRIC_ROWS) {
      values[row.id] = row.rexOnly ? null : (plan[row.id] ?? null);
    }
    return values;
  }

  if (column.kind === "rex") {
    const plan = column.evaUuid ? computePlanMetrics(mission, column.evaUuid) : {};
    const rex = column.rexUuid ? mission.rexes?.[column.rexUuid] : undefined;
    const rexMetrics = rex ? computeRexMetrics(rex, planetRadius) : {};
    for (const row of EVA_COMPARISON_METRIC_ROWS) {
      values[row.id] = row.rexOnly ? (rexMetrics[row.id] ?? null) : (plan[row.id] ?? null);
    }
    return values;
  }

  const campaign = column.campaignUuid ? mission.reportCampaigns?.[column.campaignUuid] : undefined;

  if (column.kind === "campaignPlanned") {
    const memberMetrics = (campaign?.memberEvaUuids ?? [])
      .filter((evaUuid) => !!mission.evas?.[evaUuid])
      .map((evaUuid) => computePlanMetrics(mission, evaUuid));
    for (const row of EVA_COMPARISON_METRIC_ROWS) {
      values[row.id] = row.rexOnly
        ? null
        : aggregate(
            memberMetrics.map((metrics) => metrics[row.id] ?? null),
            row.aggregation
          );
    }
    return values;
  }

  if (column.kind === "campaignExecuted") {
    const executionRexes = campaign ? resolveCampaignExecutionRexes(mission, campaign) : [];
    const perRexMetrics = executionRexes.map((rex) => ({
      ...computePlanMetrics(mission, rex.evaUuid),
      ...computeRexMetrics(rex, planetRadius),
    }));
    for (const row of EVA_COMPARISON_METRIC_ROWS) {
      values[row.id] = aggregate(
        perRexMetrics.map((metrics) => metrics[row.id] ?? null),
        row.aggregation
      );
    }
    return values;
  }

  // Unknown kind: all null.
  for (const row of EVA_COMPARISON_METRIC_ROWS) values[row.id] = null;
  return values;
};

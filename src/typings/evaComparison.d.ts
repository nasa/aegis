/**
 * Ambient types for the "EVA Comparison" report pure module
 * (src/utils/evaComparison.ts). Declared without `export`, per repo convention.
 */

/** Left-axis grouping for the comparison table's metric rows. */
type EvaComparisonMetricGroup = "time" | "distance" | "work" | "rexOnly";

/** One metric (a row of the comparison table). */
type EvaComparisonMetricRow = {
  id: string; // stable, e.g. "totalEvaTimeCalculated"
  label: string;
  group: EvaComparisonMetricGroup;
  unit: string | null; // e.g. "min", "m", "g"; "" for counts
  rexOnly: boolean; // true = blank/null for plan (eva/campaignPlanned) columns
  aggregation: "sum" | "max"; // how campaign columns aggregate member values
};

/**
 * Computed value per metric row for one report column.
 * null = N/A (a rexOnly row on a plan column, or missing/absent data).
 */
type EvaComparisonColumnValues = { [metricRowId: string]: number | null };

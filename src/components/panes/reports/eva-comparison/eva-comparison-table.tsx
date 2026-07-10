import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "../shared/report-grid.module.css";
import comparisonStyles from "./eva-comparison.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { reportSetHoveredLeftItem } from "store/report";
import { groupCoverageColumns } from "utils/evaReportColumns";
import { EVA_COMPARISON_METRIC_ROWS } from "utils/evaComparison";
import { EvaComparisonColumnCells } from "./eva-comparison-cell";

/** Width of the metric-label left axis column (matches the header corner). */
export const METRIC_LABEL_COLUMN_WIDTH = 260;

const GROUP_ORDER: EvaComparisonMetricGroup[] = ["time", "distance", "work", "rexOnly"];
const GROUP_LABEL: { [group in EvaComparisonMetricGroup]: string } = {
  time: "Time",
  distance: "Distance",
  work: "Work",
  rexOnly: "REX-only (as executed)",
};

/**
 * Left axis (metric rows) of the EVA Comparison grid, grouped Time / Distance /
 * Work / REX-only. Everything right of the metric labels reuses the shared
 * report grid components and dividers so the layout is identical to EVA STM
 * Coverage.
 */
const EvaComparisonTable: FunctionComponent = () => {
  const visibleRowIds = useAppSelector(
    (state) => state.report.comparison.visibleRowIds,
    shallowEqual
  );

  const rowVisible = (rowId: string) => !visibleRowIds || visibleRowIds.includes(rowId);

  return (
    <div>
      {GROUP_ORDER.map((group) => {
        const rows = EVA_COMPARISON_METRIC_ROWS.filter(
          (row) => row.group === group && rowVisible(row.id)
        );
        if (rows.length === 0) return null;
        return (
          <Fragment key={group}>
            <div className={comparisonStyles.groupHeaderRow}>
              <div className={comparisonStyles.groupHeaderLabel}>{GROUP_LABEL[group]}</div>
            </div>
            {rows.map((row) => (
              <ComparisonRow key={row.id} row={row} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
};

export default EvaComparisonTable;

const ComparisonRow: FunctionComponent<{ row: EvaComparisonMetricRow }> = ({ row }) => {
  const visibleColumns = useAppSelector(
    (state) => state.report.comparison.visibleColumns,
    shallowEqual
  );
  const columnGroups = groupCoverageColumns(visibleColumns);

  return (
    <div className={comparisonStyles.metricRow}>
      <MetricLabel row={row} />
      <div className={styles.tableRowCells}>
        {columnGroups.map((group, groupIndex) => (
          <Fragment key={group.groupKey}>
            {groupIndex === 0 && !group.columns[0]?.campaignUuid && (
              <div className={`${styles.columnDivider} ${styles.campaignDivider}`} />
            )}
            {groupIndex > 0 && (
              <div
                className={`${styles.columnDivider} ${
                  group.columns[0]?.campaignUuid &&
                  !columnGroups[groupIndex - 1]?.columns[0]?.campaignUuid
                    ? styles.campaignDivider
                    : ""
                }`}
              />
            )}
            {group.columns.map((column) => (
              <EvaComparisonColumnCells key={column.key} column={column} row={row} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

const MetricLabel: FunctionComponent<{ row: EvaComparisonMetricRow }> = ({ row }) => {
  const dispatch = useAppDispatch();
  const hovered = useAppSelector(
    (state) => state.report.comparison.hoveredLeftItem === row.id,
    refEqual
  );
  return (
    <div
      className={comparisonStyles.metricLabel}
      style={hovered ? { backgroundColor: "var(--stmCoverageHover)" } : undefined}
      onMouseEnter={() =>
        dispatch(reportSetHoveredLeftItem({ reportId: "comparison", item: row.id }))
      }
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={row.label}
    >
      {row.label}
      {row.unit ? <span className={comparisonStyles.metricUnit}>({row.unit})</span> : null}
    </div>
  );
};

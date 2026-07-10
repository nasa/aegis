import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "../shared/report-grid.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { BaseCell, NumericDiff, numericDiffClass } from "../shared/report-cell";

const REPORT_ID: ColumnReportId = "comparison";

/** Round for display: counts as integers, other metrics to 1 decimal under 100. */
const formatNumber = (row: EvaComparisonMetricRow, value: number): string => {
  if (row.unit === "" || Number.isInteger(value)) return Math.round(value).toLocaleString();
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString();
};

/**
 * All cells for one (metric row × column): a single value cell when collapsed,
 * or per-member-EVA sub-cells + a Total when an expanded campaign column. Sub-
 * cells show absolute member values; the Total honours diff mode like coverage.
 */
export const EvaComparisonColumnCells: FunctionComponent<{
  column: EvaReportColumn;
  row: EvaComparisonMetricRow;
}> = ({ column, row }) => {
  const expanded = useAppSelector(
    (state) => state.report[REPORT_ID].expandedColumns.includes(column.key),
    refEqual
  );
  const sequenceItems = useAppSelector(
    (state) => state.report[REPORT_ID].sequenceByColumnKey[column.key],
    shallowEqual
  );

  if (!expanded || !sequenceItems || sequenceItems.length === 0) {
    return <SummaryCell column={column} row={row} />;
  }

  return (
    <>
      {sequenceItems.map((item) => (
        <MemberCell
          key={item.uuid}
          cellKey={`${column.key}_${item.uuid}`}
          row={row}
          name={item.name}
        />
      ))}
      <SummaryCell column={column} row={row} />
    </>
  );
};

const SummaryCell: FunctionComponent<{ column: EvaReportColumn; row: EvaComparisonMetricRow }> = ({
  column,
  row,
}) => {
  const metricsByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].metricsByColumnKey,
    refEqual
  );
  const baselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].resolvedBaselineKey,
    refEqual
  );
  const diffMode = useAppSelector((state) => state.report[REPORT_ID].diffMode, refEqual);

  const value = metricsByColumnKey[column.key]?.[row.id] ?? null;
  const baselineValue = baselineKey ? (metricsByColumnKey[baselineKey]?.[row.id] ?? null) : null;
  const isBaseline = column.key === baselineKey;
  const showDiff = diffMode && !isBaseline && value != null && baselineValue != null;

  const { content, className, tooltip } = useMemo(() => {
    if (value == null) {
      return { content: "", className: styles.cellNone, tooltip: `${row.label}: n/a` };
    }
    if (!showDiff || baselineValue == null) {
      return {
        content: formatNumber(row, value),
        className: "",
        tooltip: `${column.label}: ${formatNumber(row, value)}${row.unit ? ` ${row.unit}` : ""}`,
      };
    }
    const delta = value - baselineValue;
    return {
      content: <NumericDiff delta={delta} format={(v) => formatNumber(row, v)} />,
      className: numericDiffClass(delta),
      tooltip:
        delta === 0
          ? `${column.label}: same as baseline`
          : `${column.label}: ${delta > 0 ? "+" : "−"}${formatNumber(row, Math.abs(delta))}${
              row.unit ? ` ${row.unit}` : ""
            } vs baseline`,
    };
  }, [value, baselineValue, showDiff, row, column.label]);

  return (
    <BaseCell cellKey={column.key} rowId={row.id} className={className} tooltip={tooltip}>
      {content}
    </BaseCell>
  );
};

/** A per-member (22px) absolute-value sub-cell of an expanded campaign column. */
const MemberCell: FunctionComponent<{
  cellKey: string;
  row: EvaComparisonMetricRow;
  name: string;
}> = ({ cellKey, row, name }) => {
  const value = useAppSelector(
    (state) => state.report[REPORT_ID].metricsByColumnKey[cellKey]?.[row.id] ?? null,
    refEqual
  );
  return (
    <BaseCell
      cellKey={cellKey}
      rowId={row.id}
      className={styles.cellStation}
      tooltip={`${name}: ${value == null ? "n/a" : `${formatNumber(row, value)}${row.unit ? ` ${row.unit}` : ""}`}`}
    >
      {value == null ? "" : formatNumber(row, value)}
    </BaseCell>
  );
};

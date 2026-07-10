import type { FunctionComponent, ReactNode } from "react";
import styles from "./report-grid.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { reportSetHoveredLeftItem, reportSetHoveredTopItem } from "store/report";
import { useReportId } from "../reports-context";

/**
 * The shared cell shell for the column-family reports (EVA STM Coverage, EVA
 * Comparison): the crosshair-hover wiring (top = column key, left = row id) and
 * the click handler. The cell body — coverage rollup or comparison metric — is
 * supplied as children by each report's own cell component. `rowId` is the
 * left-axis identity (a level3 uuid for coverage, a metric-row id for
 * comparison) used for the row crosshair highlight.
 */
export const BaseCell: FunctionComponent<{
  cellKey: string;
  rowId: string;
  className?: string;
  tooltip: string;
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}> = ({ cellKey, rowId, className, tooltip, selected, onClick, children }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();

  return (
    <div
      className={`${styles.cell} ${className ?? ""} ${selected ? styles.cellSelected : ""}`}
      onClick={onClick}
      onMouseEnter={() => {
        dispatch(reportSetHoveredTopItem({ reportId, item: cellKey }));
        dispatch(reportSetHoveredLeftItem({ reportId, item: rowId }));
      }}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={tooltip}
    >
      {children}
    </div>
  );
};

/**
 * The shared diff-value renderer: a signed numeric delta shown as "+Δ" (green)
 * / "−Δ" (red) / "=" (neutral), with the net tint class returned so the caller
 * can apply it to the cell background. `format` renders the absolute magnitude
 * (already rounded/unit-formatted by the caller). Used by EVA Comparison; EVA
 * Coverage stacks added/removed counts with the same css classes directly.
 */
export const NumericDiff: FunctionComponent<{
  delta: number;
  format: (value: number) => string;
}> = ({ delta, format }) => {
  if (delta === 0) return <span className={styles.cellDiffEqual}>=</span>;
  return (
    <span className={delta > 0 ? styles.cellDiffAdded : styles.cellDiffRemoved}>
      {delta > 0 ? "+" : "−"}
      {format(Math.abs(delta))}
    </span>
  );
};

/** The net tint class for a numeric delta (green positive / red negative / neutral zero). */
export const numericDiffClass = (delta: number): string =>
  delta > 0 ? styles.cellDiffPositive : delta < 0 ? styles.cellDiffNegative : styles.cellDiffEqual;

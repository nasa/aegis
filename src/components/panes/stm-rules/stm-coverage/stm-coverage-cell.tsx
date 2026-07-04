import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "./stm-coverage.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { stmCoverageSetHoveredLeftItem, stmCoverageSetHoveredTopItem } from "store/stm";
import { diffLevel3, groupMatchesBySequenceItem } from "utils/stmEvaCoverage";
import { useStmCoverage } from "./stm-coverage-context";

/** Whether the drilldown selection points at exactly this cell. */
const isCellSelected = (
  selection: StmCoverageCellSelection,
  target: NonNullable<StmCoverageCellSelection>
): boolean =>
  !!selection &&
  selection.stmUuid === target.stmUuid &&
  selection.columnKey === target.columnKey &&
  selection.stationUuid === target.stationUuid &&
  selection.traverseUuid === target.traverseUuid;

/**
 * All cells for one (level3 row × EVA column): a single summary cell when the
 * column is collapsed, or per-station/per-traverse sub-cells (in EVA sequence
 * order) + Total when expanded. Sub-cell counts always sum to the Total cell.
 */
export const StmCoverageColumnCells: FunctionComponent<{
  column: StmCoverageEvaColumn;
  stmUuid: string;
}> = ({ column, stmUuid }) => {
  const { mission, coverageByColumnKey, expandedColumnKeys, sequenceByColumnKey } =
    useStmCoverage();
  const coverage = coverageByColumnKey[column.key]?.[stmUuid];
  const isExpanded = expandedColumnKeys.includes(column.key);

  const sequenceMatches = useMemo(
    () =>
      coverage && isExpanded
        ? groupMatchesBySequenceItem({ mission, level3Coverage: coverage })
        : null,
    [mission, coverage, isExpanded]
  );

  if (!coverage) return null;

  if (!isExpanded) {
    return <SummaryCell column={column} stmUuid={stmUuid} coverage={coverage} />;
  }

  const sequenceItems = sequenceByColumnKey[column.key] ?? [];
  return (
    <>
      {sequenceItems.map((item) => {
        const count =
          (item.type === "station"
            ? sequenceMatches?.stations[item.uuid]
            : sequenceMatches?.traverses[item.uuid]) ?? 0;
        return (
          <CountCell
            key={item.uuid}
            cellKey={`${column.key}_${item.uuid}`}
            stmUuid={stmUuid}
            count={count}
            tooltip={`${item.name}: ${count} matching actions`}
            onClickSelection={
              item.type === "station"
                ? { stmUuid, columnKey: column.key, stationUuid: item.uuid }
                : { stmUuid, columnKey: column.key, traverseUuid: item.uuid }
            }
          />
        );
      })}
      <SummaryCell column={column} stmUuid={stmUuid} coverage={coverage} />
    </>
  );
};

const STATUS_CLASS: { [status in StmCoverageLevel3Status]: string } = {
  satisfied: styles.cellSatisfied,
  partial: styles.cellPartial,
  none: styles.cellNone,
  noRules: styles.cellNoRules,
};

const STATUS_LABEL: { [status in StmCoverageLevel3Status]: string } = {
  satisfied: "all rules satisfied",
  partial: "partially satisfied",
  none: "no matching actions",
  noRules: "no rules defined",
};

/**
 * The rollup cell for one column. Baseline (or absolute mode) shows the match
 * total colored by status; other columns in diff mode show the delta vs the
 * baseline.
 */
const SummaryCell: FunctionComponent<{
  column: StmCoverageEvaColumn;
  stmUuid: string;
  coverage: StmCoverageLevel3;
}> = ({ column, stmUuid, coverage }) => {
  const { coverageByColumnKey, baselineKey, diffMode, cellSelection, setCellSelection } =
    useStmCoverage();

  const isBaseline = column.key === baselineKey;
  const baselineCoverage = baselineKey ? coverageByColumnKey[baselineKey]?.[stmUuid] : null;
  const showDiff = diffMode && !isBaseline && !!baselineCoverage && coverage.status !== "noRules";

  let text: string;
  let statusClass = "";
  let tooltip: string;
  if (coverage.status === "noRules") {
    text = "—";
    statusClass = STATUS_CLASS.noRules;
    tooltip = `${column.label}: ${STATUS_LABEL.noRules}`;
  } else if (!showDiff) {
    text = `${coverage.totalMatches}`;
    statusClass = STATUS_CLASS[coverage.status];
    const satisfiedRules = coverage.rules.filter((rc) => rc.satisfied).length;
    tooltip = `${column.label}: ${coverage.totalMatches} matching actions, ${satisfiedRules}/${coverage.rules.length} rules satisfied (${STATUS_LABEL[coverage.status]})`;
  } else {
    const diff = diffLevel3(baselineCoverage, coverage);
    if (diff.equal) {
      text = "=";
      statusClass = styles.cellDiffEqual;
      tooltip = `${column.label}: same coverage as baseline`;
    } else if (diff.delta === 0) {
      text = "≠";
      statusClass = styles.cellDiffEqual;
      tooltip = `${column.label}: same total as baseline but matches come from different rules`;
    } else if (diff.delta > 0) {
      text = `+${diff.delta}`;
      statusClass = styles.cellDiffPositive;
      tooltip = `${column.label}: ${diff.delta} more matching actions than baseline`;
    } else {
      text = `−${Math.abs(diff.delta)}`;
      statusClass = styles.cellDiffNegative;
      tooltip = `${column.label}: ${Math.abs(diff.delta)} fewer matching actions than baseline`;
    }
    if (diff.statusChanged) {
      statusClass = `${statusClass} ${styles.cellStatusChanged}`;
      tooltip += ` — status changed from ${STATUS_LABEL[baselineCoverage.status]} to ${STATUS_LABEL[coverage.status]}`;
    }
  }

  return (
    <BaseCell
      cellKey={column.key}
      stmUuid={stmUuid}
      className={statusClass}
      tooltip={tooltip}
      selected={isCellSelected(cellSelection, { stmUuid, columnKey: column.key })}
      onClick={() => setCellSelection({ stmUuid, columnKey: column.key })}
    >
      {text}
    </BaseCell>
  );
};

/** A 22px per-station (or per-traverse) count sub-cell. Blank when zero. */
const CountCell: FunctionComponent<{
  cellKey: string;
  stmUuid: string;
  count: number;
  tooltip: string;
  onClickSelection: {
    stmUuid: string;
    columnKey: string;
    stationUuid?: string;
    traverseUuid?: string;
  };
}> = ({ cellKey, stmUuid, count, tooltip, onClickSelection }) => {
  const { cellSelection, setCellSelection } = useStmCoverage();
  return (
    <BaseCell
      cellKey={cellKey}
      stmUuid={stmUuid}
      className={styles.cellStation}
      tooltip={tooltip}
      selected={isCellSelected(cellSelection, onClickSelection)}
      onClick={() => setCellSelection(onClickSelection)}
    >
      {count > 0 ? count : ""}
    </BaseCell>
  );
};

const BaseCell: FunctionComponent<{
  cellKey: string;
  stmUuid: string;
  className?: string;
  tooltip: string;
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ cellKey, stmUuid, className, tooltip, selected, onClick, children }) => {
  const dispatch = useAppDispatch();

  return (
    <div
      className={`${styles.cell} ${className ?? ""} ${selected ? styles.cellSelected : ""}`}
      onClick={onClick}
      onMouseEnter={() => {
        dispatch(stmCoverageSetHoveredTopItem(cellKey));
        dispatch(stmCoverageSetHoveredLeftItem(stmUuid));
      }}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={tooltip}
    >
      {children}
    </div>
  );
};

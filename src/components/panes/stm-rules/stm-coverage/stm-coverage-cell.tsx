import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "./stm-coverage.module.css";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { stmCoverageSetHoveredLeftItem, stmCoverageSetHoveredTopItem } from "store/stm";
import { diffLevel3, groupMatchesBySequenceItem } from "utils/stmEvaCoverage";
import { useStmCoverage } from "./stm-coverage-context";

/**
 * All cells for one (level3 row × EVA column): a single summary cell when the
 * column is collapsed, or per-station sub-cells + Traverses + Total when
 * expanded. Sub-cell counts always sum to the Total cell.
 */
export const StmCoverageColumnCells: FunctionComponent<{
  column: StmCoverageEvaColumn;
  stmUuid: string;
}> = ({ column, stmUuid }) => {
  const { mission, coverageByColumnKey, expandedColumnKeys, stationsByColumnKey } =
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

  const stations = stationsByColumnKey[column.key] ?? [];
  return (
    <>
      {stations.map((station) => (
        <CountCell
          key={station.uuid}
          cellKey={`${column.key}_${station.uuid}`}
          stmUuid={stmUuid}
          count={sequenceMatches?.stations[station.uuid] ?? 0}
          tooltip={`${station.name}: ${sequenceMatches?.stations[station.uuid] ?? 0} matching actions`}
          onClickSelection={{ stmUuid, columnKey: column.key, stationUuid: station.uuid }}
        />
      ))}
      <CountCell
        cellKey={`${column.key}_trav`}
        stmUuid={stmUuid}
        count={sequenceMatches?.traverseTotal ?? 0}
        tooltip={`Traverses: ${sequenceMatches?.traverseTotal ?? 0} matching actions`}
        onClickSelection={{ stmUuid, columnKey: column.key, traversesOnly: true }}
      />
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
  const { coverageByColumnKey, baselineKey, diffMode, setCellSelection } = useStmCoverage();

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
      onClick={() => setCellSelection({ stmUuid, columnKey: column.key })}
    >
      {text}
    </BaseCell>
  );
};

/** A 22px per-station (or Traverses) count sub-cell. Blank when zero. */
const CountCell: FunctionComponent<{
  cellKey: string;
  stmUuid: string;
  count: number;
  tooltip: string;
  onClickSelection: {
    stmUuid: string;
    columnKey: string;
    stationUuid?: string;
    traversesOnly?: boolean;
  };
}> = ({ cellKey, stmUuid, count, tooltip, onClickSelection }) => {
  const { setCellSelection } = useStmCoverage();
  return (
    <BaseCell
      cellKey={cellKey}
      stmUuid={stmUuid}
      className={styles.cellStation}
      tooltip={tooltip}
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
  onClick: () => void;
  children: React.ReactNode;
}> = ({ cellKey, stmUuid, className, tooltip, onClick, children }) => {
  const dispatch = useAppDispatch();
  const isHovered = useAppSelector(
    (state) =>
      state.stm.stmCoverageHoveredTopItem === cellKey ||
      state.stm.stmCoverageHoveredLeftItem === stmUuid,
    refEqual
  );

  return (
    <div
      className={`${styles.cell} ${className ?? ""} ${isHovered ? styles.cellHovered : ""}`}
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

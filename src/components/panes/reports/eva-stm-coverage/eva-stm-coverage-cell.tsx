import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "../shared/report-grid.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { reportSetCellSelection } from "store/report";
import { diffLevel3Actions, groupMatchesBySequenceItem } from "utils/stmEvaCoverage";
import { groupCampaignMatchesByMember } from "utils/evaReportColumns";
import { BaseCell } from "../shared/report-cell";
import { useReportId } from "../reports-context";

const REPORT_ID: ColumnReportId = "stmCoverage";

/** Whether the drilldown selection points at exactly this cell. */
const isCellSelected = (
  selection: StmCoverageCellSelection,
  target: NonNullable<StmCoverageCellSelection>
): boolean =>
  !!selection &&
  selection.stmUuid === target.stmUuid &&
  selection.columnKey === target.columnKey &&
  selection.stationUuid === target.stationUuid &&
  selection.traverseUuid === target.traverseUuid &&
  selection.evaUuid === target.evaUuid;

/**
 * All cells for one (level3 row × column): a single summary cell when the
 * column is collapsed, or per-station/per-traverse sub-cells (in EVA sequence
 * order) + Total when expanded. Sub-cell counts always sum to the Total cell.
 */
export const EvaStmCoverageColumnCells: FunctionComponent<{
  column: EvaReportColumn;
  stmUuid: string;
}> = ({ column, stmUuid }) => {
  const mission = useMissionDocSelector((m) => m, refEqual);
  const coverageByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].coverageByColumnKey,
    refEqual
  );
  const expandedColumnKeys = useAppSelector(
    (state) => state.report[REPORT_ID].expandedColumns,
    shallowEqual
  );
  const sequenceByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].sequenceByColumnKey,
    refEqual
  );
  const coverage = coverageByColumnKey[column.key]?.[stmUuid];
  const isExpanded = expandedColumnKeys.includes(column.key);
  const sequenceItems = useMemo(
    () => sequenceByColumnKey[column.key] ?? [],
    [sequenceByColumnKey, column.key]
  );

  const sequenceMatches = useMemo(() => {
    if (!mission || !coverage || !isExpanded) return null;
    const matches = groupMatchesBySequenceItem({ mission, level3Coverage: coverage });
    if (column.campaignUuid) {
      matches.evas = groupCampaignMatchesByMember({
        mission,
        column,
        level3Coverage: coverage,
      });
    }
    return matches;
  }, [mission, coverage, isExpanded, column]);

  if (!coverage) return null;

  if (!isExpanded) {
    return <SummaryCell column={column} stmUuid={stmUuid} coverage={coverage} />;
  }

  return (
    <>
      {sequenceItems.map((item) => {
        const count =
          (item.type === "station"
            ? sequenceMatches?.stations[item.uuid]
            : item.type === "traverse"
              ? sequenceMatches?.traverses[item.uuid]
              : sequenceMatches?.evas[item.uuid]) ?? 0;
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
                : item.type === "traverse"
                  ? { stmUuid, columnKey: column.key, traverseUuid: item.uuid }
                  : { stmUuid, columnKey: column.key, evaUuid: item.uuid }
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
 * total colored by status; other columns in diff mode show the added and
 * removed action counts vs the baseline (paired per rule by verb/noun/
 * adjective tuple), with the background tint driven by the net change.
 */
const SummaryCell: FunctionComponent<{
  column: EvaReportColumn;
  stmUuid: string;
  coverage: StmCoverageLevel3;
}> = ({ column, stmUuid, coverage }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const coverageByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].coverageByColumnKey,
    refEqual
  );
  const baselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].resolvedBaselineKey,
    refEqual
  );
  const diffMode = useAppSelector((state) => state.report[REPORT_ID].diffMode, refEqual);
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);

  const isBaseline = column.key === baselineKey;
  const baselineCoverage = baselineKey ? coverageByColumnKey[baselineKey]?.[stmUuid] : null;
  const showDiff = diffMode && !isBaseline && !!baselineCoverage && coverage.status !== "noRules";

  const actionsDiff = useMemo(
    () =>
      showDiff && mission && baselineCoverage
        ? diffLevel3Actions({ mission, baseline: baselineCoverage, other: coverage })
        : null,
    [showDiff, mission, baselineCoverage, coverage]
  );

  let content: React.ReactNode;
  let statusClass = "";
  let tooltip: string;
  if (coverage.status === "noRules") {
    content = "—";
    statusClass = STATUS_CLASS.noRules;
    tooltip = `${column.label}: ${STATUS_LABEL.noRules}`;
  } else if (!showDiff || !actionsDiff || !baselineCoverage) {
    content = `${coverage.totalMatches}`;
    statusClass = STATUS_CLASS[coverage.status];
    const satisfiedRules = coverage.rules.filter((rc) => rc.satisfied).length;
    tooltip = `${column.label}: ${coverage.totalMatches} matching actions, ${satisfiedRules}/${coverage.rules.length} rules satisfied (${STATUS_LABEL[coverage.status]})`;
  } else {
    const { added, removed } = actionsDiff;
    const net = added - removed;
    if (added === 0 && removed === 0) {
      content = "=";
      statusClass = styles.cellDiffEqual;
      tooltip = `${column.label}: same coverage as baseline`;
    } else {
      content = (
        <span className={styles.cellDiffValues}>
          {added > 0 && <span className={styles.cellDiffAdded}>+{added}</span>}
          {removed > 0 && <span className={styles.cellDiffRemoved}>−{removed}</span>}
        </span>
      );
      statusClass =
        net > 0
          ? styles.cellDiffPositive
          : net < 0
            ? styles.cellDiffNegative
            : styles.cellDiffEqual;
      tooltip = `${column.label}: ${added} added, ${removed} removed vs baseline`;
    }
    if (baselineCoverage.status !== coverage.status) {
      statusClass = `${statusClass} ${styles.cellStatusChanged}`;
      tooltip += ` — status changed from ${STATUS_LABEL[baselineCoverage.status]} to ${STATUS_LABEL[coverage.status]}`;
    }
  }

  return (
    <BaseCell
      cellKey={column.key}
      rowId={stmUuid}
      className={statusClass}
      tooltip={tooltip}
      selected={isCellSelected(cellSelection, { stmUuid, columnKey: column.key })}
      onClick={() =>
        dispatch(
          reportSetCellSelection({ reportId, selection: { stmUuid, columnKey: column.key } })
        )
      }
    >
      {content}
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
    evaUuid?: string;
  };
}> = ({ cellKey, stmUuid, count, tooltip, onClickSelection }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);
  return (
    <BaseCell
      cellKey={cellKey}
      rowId={stmUuid}
      className={styles.cellStation}
      tooltip={tooltip}
      selected={isCellSelected(cellSelection, onClickSelection)}
      onClick={() => dispatch(reportSetCellSelection({ reportId, selection: onClickSelection }))}
    >
      {count > 0 ? count : ""}
    </BaseCell>
  );
};

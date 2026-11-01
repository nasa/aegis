import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "../shared/report-grid.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { reportSetCellSelection } from "store/report";
import {
  diffPriorityCell,
  groupCampaignPriorityMatchesByMember,
  groupPriorityMatchesBySequenceItem,
} from "utils/missionPriorityReport";
import { BaseCell } from "../shared/report-cell";
import { useReportId } from "../reports-context";

const REPORT_ID: ColumnReportId = "missionPriorities";

const isCellSelected = (
  selection: StmCoverageCellSelection,
  target: NonNullable<StmCoverageCellSelection>
): boolean =>
  !!selection &&
  (selection.priorityUuid ?? selection.stmUuid) === (target.priorityUuid ?? target.stmUuid) &&
  selection.columnKey === target.columnKey &&
  selection.stationUuid === target.stationUuid &&
  selection.traverseUuid === target.traverseUuid &&
  selection.evaUuid === target.evaUuid;

const STATUS_CLASS: { [status in MissionPriorityCellStatus]: string } = {
  complete: styles.cellSatisfied,
  planned: styles.cellSatisfied,
  inProgress: styles.cellPartial,
  pending: styles.cellPartial,
  skippedOnly: styles.cellSkippedOnly,
  disabledOnly: styles.cellDisabledOnly,
  none: styles.cellNone,
};

export const PRIORITY_STATUS_LABEL: { [status in MissionPriorityCellStatus]: string } = {
  complete: "completed",
  planned: "planned",
  inProgress: "in progress",
  pending: "pending execution",
  skippedOnly: "all skipped",
  disabledOnly: "disabled only",
  none: "no active actions",
};

const formatColumnDisplayLabel = (column: EvaReportColumn): string =>
  column.isRex
    ? `REX: ${column.label}`
    : column.campaignUuid
      ? `${column.groupLabel}: ${column.label}`
      : column.label;

/**
 * All cells for one (priority row × column): a single summary cell when collapsed,
 * or a Total followed by per-station/per-traverse (or per-member EVA) sub-cells
 * when expanded.
 */
export const MissionPrioritiesColumnCells: FunctionComponent<{
  column: EvaReportColumn;
  priorityUuid: string;
}> = ({ column, priorityUuid }) => {
  const mission = useMissionDocSelector((m) => m, refEqual);
  const coverageByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].priorityCoverageByColumnKey,
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
  const coverage = coverageByColumnKey?.[column.key]?.[priorityUuid];
  const isExpanded = expandedColumnKeys.includes(column.key);
  const sequenceItems = useMemo(
    () => sequenceByColumnKey[column.key] ?? [],
    [sequenceByColumnKey, column.key]
  );

  const sequenceMatches = useMemo(() => {
    if (!mission || !coverage || !isExpanded) return null;
    const matches = groupPriorityMatchesBySequenceItem({
      mission,
      cellCoverage: coverage,
      includeDisabled: false,
    });
    if (column.campaignUuid) {
      matches.evas = groupCampaignPriorityMatchesByMember({
        mission,
        column,
        cellCoverage: coverage,
        includeDisabled: false,
      });
    }
    return matches;
  }, [mission, coverage, isExpanded, column]);

  if (!coverage) return null;

  if (!isExpanded) {
    return <SummaryCell column={column} priorityUuid={priorityUuid} coverage={coverage} />;
  }

  return (
    <>
      <SummaryCell column={column} priorityUuid={priorityUuid} coverage={coverage} />
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
            priorityUuid={priorityUuid}
            count={count}
            tooltip={`${item.name}: ${count} active action${count === 1 ? "" : "s"}`}
            onClickSelection={
              item.type === "station"
                ? {
                    stmUuid: priorityUuid,
                    priorityUuid,
                    columnKey: column.key,
                    stationUuid: item.uuid,
                  }
                : item.type === "traverse"
                  ? {
                      stmUuid: priorityUuid,
                      priorityUuid,
                      columnKey: column.key,
                      traverseUuid: item.uuid,
                    }
                  : {
                      stmUuid: priorityUuid,
                      priorityUuid,
                      columnKey: column.key,
                      evaUuid: item.uuid,
                    }
            }
          />
        );
      })}
    </>
  );
};

const maskDisabledCoverage = (
  coverage: MissionPriorityCellCoverage,
  includeDisabled: boolean
): MissionPriorityCellCoverage => {
  if (includeDisabled || coverage.disabledCount === 0) return coverage;
  return {
    ...coverage,
    status: coverage.status === "disabledOnly" ? "none" : coverage.status,
    disabledCount: 0,
    disabledActionUuids: [],
  };
};

const SummaryCell: FunctionComponent<{
  column: EvaReportColumn;
  priorityUuid: string;
  coverage: MissionPriorityCellCoverage;
}> = ({ column, priorityUuid, coverage }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const coverageByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].priorityCoverageByColumnKey,
    refEqual
  );
  const baselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].resolvedBaselineKey,
    refEqual
  );
  const diffMode = useAppSelector((state) => state.report[REPORT_ID].diffMode, refEqual);
  const includeDisabledActions = useAppSelector(
    (state) => state.report[REPORT_ID].includeDisabledActions ?? true,
    refEqual
  );
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);

  const effectiveCoverage = useMemo(
    () => maskDisabledCoverage(coverage, includeDisabledActions),
    [coverage, includeDisabledActions]
  );
  const rawBaselineCoverage = baselineKey
    ? coverageByColumnKey?.[baselineKey]?.[priorityUuid]
    : null;
  const baselineCoverage = useMemo(
    () =>
      rawBaselineCoverage
        ? maskDisabledCoverage(rawBaselineCoverage, includeDisabledActions)
        : null,
    [rawBaselineCoverage, includeDisabledActions]
  );

  const isBaseline = column.key === baselineKey;
  const showDiff = diffMode && !isBaseline && !!baselineCoverage;

  const cellDiff = useMemo(
    () =>
      showDiff && mission && baselineCoverage
        ? diffPriorityCell({ mission, baseline: baselineCoverage, other: effectiveCoverage })
        : null,
    [showDiff, mission, baselineCoverage, effectiveCoverage]
  );

  const columnDisplay = formatColumnDisplayLabel(column);
  let content: React.ReactNode;
  let statusClass = "";
  let tooltip: string;

  if (!showDiff || !cellDiff || !baselineCoverage) {
    statusClass = STATUS_CLASS[effectiveCoverage.status];
    if (effectiveCoverage.status === "disabledOnly") {
      content = "0 (D)";
      tooltip = `${columnDisplay}: 0 active actions (${effectiveCoverage.disabledCount} disabled — not active)`;
    } else if (effectiveCoverage.status === "skippedOnly" && effectiveCoverage.activeCount === 0) {
      content = "0 (S)";
      tooltip = `${columnDisplay}: 0 active actions (${effectiveCoverage.skippedCount} skipped in execution)`;
    } else {
      content = `${effectiveCoverage.activeCount}`;
      const details: string[] = [PRIORITY_STATUS_LABEL[effectiveCoverage.status]];
      if (column.kind === "rex" || column.kind === "campaignExecuted") {
        const rexParts: string[] = [];
        if (effectiveCoverage.completeCount > 0) {
          rexParts.push(`${effectiveCoverage.completeCount} completed`);
        }
        if (effectiveCoverage.inProgressCount > 0) {
          rexParts.push(`${effectiveCoverage.inProgressCount} in progress`);
        }
        if (effectiveCoverage.pendingCount > 0) {
          rexParts.push(`${effectiveCoverage.pendingCount} pending`);
        }
        if (effectiveCoverage.skippedCount > 0) {
          rexParts.push(`${effectiveCoverage.skippedCount} skipped`);
        }
        if (rexParts.length > 0) details.push(rexParts.join(", "));
      }
      if (effectiveCoverage.disabledCount > 0) {
        details.push(`${effectiveCoverage.disabledCount} disabled`);
      }
      tooltip = `${columnDisplay}: ${effectiveCoverage.activeCount} active action${
        effectiveCoverage.activeCount === 1 ? "" : "s"
      } (${details.join("; ")})`;
    }
  } else {
    const added = cellDiff.added.length;
    const removed = cellDiff.removed.length;
    const net = added - removed;
    if (added === 0 && removed === 0) {
      content = "=";
      statusClass = styles.cellDiffEqual;
      tooltip = `${columnDisplay}: same active priority actions as baseline`;
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
      tooltip = `${columnDisplay}: ${added} added, ${removed} removed vs baseline`;
    }
    if (cellDiff.statusChanged) {
      statusClass = `${statusClass} ${styles.cellStatusChanged}`;
      tooltip += ` — status changed from ${PRIORITY_STATUS_LABEL[baselineCoverage.status]} to ${
        PRIORITY_STATUS_LABEL[effectiveCoverage.status]
      }`;
    } else if (effectiveCoverage.disabledCount !== baselineCoverage.disabledCount) {
      tooltip += ` (${effectiveCoverage.disabledCount} disabled vs ${baselineCoverage.disabledCount} in baseline)`;
    }
  }

  const selectionTarget = { stmUuid: priorityUuid, priorityUuid, columnKey: column.key };

  return (
    <BaseCell
      cellKey={column.key}
      rowId={priorityUuid}
      className={statusClass}
      tooltip={tooltip}
      selected={isCellSelected(cellSelection, selectionTarget)}
      onClick={() =>
        dispatch(
          reportSetCellSelection({
            reportId,
            selection: selectionTarget,
          })
        )
      }
    >
      {content}
    </BaseCell>
  );
};

const CountCell: FunctionComponent<{
  cellKey: string;
  priorityUuid: string;
  count: number;
  tooltip: string;
  onClickSelection: NonNullable<StmCoverageCellSelection>;
}> = ({ cellKey, priorityUuid, count, tooltip, onClickSelection }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);

  return (
    <BaseCell
      cellKey={cellKey}
      rowId={priorityUuid}
      className={styles.cellStation}
      tooltip={tooltip}
      selected={isCellSelected(cellSelection, onClickSelection)}
      onClick={() => dispatch(reportSetCellSelection({ reportId, selection: onClickSelection }))}
    >
      {count > 0 ? count : ""}
    </BaseCell>
  );
};

import type { CSSProperties, FunctionComponent } from "react";
import { useEffect, useMemo } from "react";
import styles from "../shared/report-grid.module.css";
import priorityStyles from "./mission-priorities.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  reportSetColumnDerivedData,
  reportSetHoveredLeftItem,
  reportSetHoveredTopItem,
  reportToggleIncludeDisabledActions,
} from "store/report";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getEvaSequenceItems } from "utils/stmEvaCoverage";
import { getCampaignMemberItems, getEvaColumns } from "utils/evaReportColumns";
import {
  computePriorityColumnCoverage,
  computePriorityUnscheduledUsages,
  getPriorityCoverageDifferences,
  getSortedMissionPrioritiesByCategory,
} from "utils/missionPriorityReport";
import {
  STM_COVERAGE_STATION_CELL_WIDTH,
  STM_COVERAGE_SUMMARY_CELL_WIDTH,
} from "../../stm-rules/stm-rules-tier-titles";
import { Checkbox } from "components/interface/form/globalFields";
import ReportControls from "../shared/report-controls";
import ReportColumnHeader from "../shared/report-column-header";
import { ReportIdProvider } from "../reports-context";
import MissionPrioritiesTable, { PRIORITY_LABEL_COLUMN_WIDTH } from "./mission-priorities-table";
import MissionPrioritiesDrilldown from "./mission-priorities-drilldown";
import MissionPrioritiesHelp from "./mission-priorities-help";

const REPORT_ID: ColumnReportId = "missionPriorities";

const MissionPrioritiesPage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const revision = useMissionDocSelector(
    (m) => ({
      missionPriorities: m?.missionPriorities,
      actions: m?.actions,
      actionTemplates: m?.actionTemplates,
      pois: m?.pois,
      stations: m?.stations,
      traverses: m?.traverses,
      evas: m?.evas,
      rexes: m?.rexes,
      reportCampaigns: m?.reportCampaigns,
      actionSystemVersion: m?.actionSystemVersion,
      actionDefinitions: m?.actionDefinitions,
      actionDefinitionConjunctions: m?.actionDefinitionConjunctions,
      actionDefinitionLabels: m?.actionDefinitionLabels,
    }),
    shallowEqual
  );

  const hiddenColumns = useAppSelector(
    (state) => state.report[REPORT_ID].hiddenColumns,
    shallowEqual
  );
  const rexStatusFilter = useAppSelector(
    (state) => state.report[REPORT_ID].rexStatusFilter,
    refEqual
  );
  const differencesOnly = useAppSelector(
    (state) => state.report[REPORT_ID].differencesOnly,
    refEqual
  );
  const includeDisabledActions = useAppSelector(
    (state) => state.report[REPORT_ID].includeDisabledActions ?? true,
    refEqual
  );
  const storedBaselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].baselineColumnKey,
    refEqual
  );
  const expandedColumnKeys = useAppSelector(
    (state) => state.report[REPORT_ID].expandedColumns,
    shallowEqual
  );
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);

  const categories = useMemo(
    () => getSortedMissionPrioritiesByCategory(mission),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
    [revision]
  );
  const allPriorityUuids = useMemo(
    () => categories.flatMap(({ items }) => items.map((item) => item.priorityUuid)),
    [categories]
  );

  const allColumns = useMemo(
    () => (mission ? getEvaColumns(mission) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
    [revision]
  );
  const visibleColumns = useMemo(
    () => allColumns.filter((column) => !hiddenColumns.includes(column.key)),
    [allColumns, hiddenColumns]
  );

  const baselineKey =
    storedBaselineKey && visibleColumns.some((column) => column.key === storedBaselineKey)
      ? storedBaselineKey
      : (visibleColumns[0]?.key ?? null);

  const priorityCoverageByColumnKey = useMemo(() => {
    const result: {
      [columnKey: string]: { [priorityUuid: string]: MissionPriorityCellCoverage };
    } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      result[column.key] = computePriorityColumnCoverage({
        mission,
        column,
        rexStatusFilter,
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
  }, [revision, visibleColumns, rexStatusFilter]);

  const unscheduledByPriorityUuid = useMemo(
    () => computePriorityUnscheduledUsages(mission),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
    [revision]
  );

  const sequenceByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: StmCoverageSequenceItem[] } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      if (expandedColumnKeys.includes(column.key)) {
        result[column.key] = column.campaignUuid
          ? getCampaignMemberItems(mission, column)
          : getEvaSequenceItems(mission, column.evaUuid ?? "");
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
  }, [revision, visibleColumns, expandedColumnKeys]);

  const effectiveCoverageForDiff = useMemo(() => {
    if (includeDisabledActions) return priorityCoverageByColumnKey;
    const masked: {
      [columnKey: string]: { [priorityUuid: string]: MissionPriorityCellCoverage };
    } = {};
    for (const [colKey, byPriority] of Object.entries(priorityCoverageByColumnKey)) {
      masked[colKey] = {};
      for (const [priorityUuid, cell] of Object.entries(byPriority)) {
        masked[colKey][priorityUuid] =
          cell.disabledCount > 0
            ? {
                ...cell,
                status: cell.status === "disabledOnly" ? "none" : cell.status,
                disabledCount: 0,
                disabledActionUuids: [],
              }
            : cell;
      }
    }
    return masked;
  }, [priorityCoverageByColumnKey, includeDisabledActions]);

  const differences = useMemo(
    () =>
      differencesOnly && baselineKey && mission
        ? getPriorityCoverageDifferences({
            mission,
            coverageByColumnKey: effectiveCoverageForDiff,
            columns: visibleColumns,
            baselineKey,
            priorityUuids: allPriorityUuids,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
    [
      differencesOnly,
      baselineKey,
      revision,
      effectiveCoverageForDiff,
      visibleColumns,
      allPriorityUuids,
    ]
  );

  const displayedColumns = useMemo(
    () =>
      differences
        ? visibleColumns.filter(
            (column) => column.key === baselineKey || differences.columnKeys.has(column.key)
          )
        : visibleColumns,
    [differences, visibleColumns, baselineKey]
  );
  const visibleRowIds = differences ? [...differences.priorityUuids] : null;
  const visibleRowIdsKey = visibleRowIds?.join(",") ?? null;

  useEffect(() => {
    dispatch(
      reportSetColumnDerivedData({
        reportId: REPORT_ID,
        data: {
          visibleColumns: displayedColumns,
          priorityCoverageByColumnKey,
          resolvedBaselineKey: baselineKey,
          sequenceByColumnKey,
          visibleRowIds,
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleRowIds gated via visibleRowIdsKey
  }, [
    dispatch,
    displayedColumns,
    priorityCoverageByColumnKey,
    baselineKey,
    sequenceByColumnKey,
    visibleRowIdsKey,
  ]);

  if (!mission) return null;

  return (
    <ReportIdProvider value={REPORT_ID}>
      <ReportControls
        allColumns={allColumns}
        baselineKey={baselineKey}
        rexFilterToolTip="Which REX action statuses count toward priority completion"
        differencesOnlyToolTip="Only show priority rows and columns that differ from the baseline"
        extraControls={
          <Checkbox
            checked={includeDisabledActions}
            editable={true}
            onChange={() => dispatch(reportToggleIncludeDisabledActions({ reportId: REPORT_ID }))}
            toolTip="Surface disabled actions (0 (D) indicators and disabled action listings in drilldown)"
            label="Show disabled"
            uniqueId="mission-priorities-show-disabled"
          />
        }
        help={<MissionPrioritiesHelp />}
      />
      <div className={styles.coverageBody}>
        <div
          className={styles.gridScroll}
          style={
            {
              "--stmCoverageStationCellWidth": `${STM_COVERAGE_STATION_CELL_WIDTH}px`,
              "--stmCoverageSummaryCellWidth": `${STM_COVERAGE_SUMMARY_CELL_WIDTH}px`,
              "--reportPriorityLabelWidth": `${PRIORITY_LABEL_COLUMN_WIDTH}px`,
            } as CSSProperties
          }
          onMouseLeave={() => {
            dispatch(reportSetHoveredTopItem({ reportId: REPORT_ID, item: null }));
            dispatch(reportSetHoveredLeftItem({ reportId: REPORT_ID, item: null }));
          }}
        >
          {mission.actionSystemVersion === 1 ? (
            <div className={styles.emptyState}>
              Mission Priority Identifiers are only available in Action System v2 missions.
            </div>
          ) : allPriorityUuids.length === 0 ? (
            <div className={styles.emptyState}>
              No Mission Priority Identifiers are configured for this mission.
            </div>
          ) : (
            <>
              <ReportColumnHeader
                leftAxis={
                  <div className={priorityStyles.leftHeaderCorner}>
                    <span>Priority Trace</span>
                    <span>Status</span>
                  </div>
                }
              />
              <MissionPrioritiesTable
                categories={categories}
                unscheduledByPriorityUuid={unscheduledByPriorityUuid}
              />
            </>
          )}
        </div>
        {cellSelection && (
          <MissionPrioritiesDrilldown unscheduledByPriorityUuid={unscheduledByPriorityUuid} />
        )}
      </div>
    </ReportIdProvider>
  );
};

export default MissionPrioritiesPage;

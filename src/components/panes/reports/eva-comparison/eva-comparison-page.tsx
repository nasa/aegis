import type { CSSProperties, FunctionComponent } from "react";
import { useEffect, useMemo } from "react";
import styles from "../shared/report-grid.module.css";
import comparisonStyles from "./eva-comparison.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  reportSetColumnDerivedData,
  reportSetHoveredLeftItem,
  reportSetHoveredTopItem,
} from "store/report";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  EVA_COMPARISON_METRIC_ROWS,
  computeComparisonColumnValues,
  computeSequenceItemMetrics,
} from "utils/evaComparison";
import { getEvaSequenceItems } from "utils/stmEvaCoverage";
import {
  getCampaignMemberItems,
  getEvaColumns,
  resolveCampaignExecutionRexes,
} from "utils/evaReportColumns";
import {
  EVA_COMPARISON_STATION_CELL_WIDTH,
  STM_COVERAGE_SUMMARY_CELL_WIDTH,
} from "../../stm-rules/stm-rules-tier-titles";
import ReportControls from "../shared/report-controls";
import ReportColumnHeader from "../shared/report-column-header";
import { ReportIdProvider } from "../reports-context";
import EvaComparisonTable, { METRIC_LABEL_COLUMN_WIDTH } from "./eva-comparison-table";

const REPORT_ID: ColumnReportId = "comparison";

/** A member EVA's synthetic column, so per-member metrics reuse computeComparisonColumnValues. */
const memberColumn = (
  mission: Mission,
  campaignColumn: EvaReportColumn,
  memberEvaUuid: string
): EvaReportColumn | null => {
  if (campaignColumn.kind === "campaignExecuted") {
    const campaign = campaignColumn.campaignUuid
      ? mission.reportCampaigns?.[campaignColumn.campaignUuid]
      : undefined;
    if (!campaign) return null;
    const rex = resolveCampaignExecutionRexes(mission, {
      ...campaign,
      memberEvaUuids: [memberEvaUuid],
    })[0];
    if (!rex) return null;
    return {
      key: `${campaignColumn.key}_${memberEvaUuid}`,
      kind: "rex",
      evaUuid: rex.evaUuid,
      isRex: true,
      rexUuid: rex.uuid,
      label: memberEvaUuid,
      groupKey: campaignColumn.groupKey,
      groupLabel: campaignColumn.groupLabel,
    };
  }
  if (!mission.evas?.[memberEvaUuid]) return null;
  return {
    key: `${campaignColumn.key}_${memberEvaUuid}`,
    kind: "eva",
    evaUuid: memberEvaUuid,
    isRex: false,
    label: memberEvaUuid,
    groupKey: campaignColumn.groupKey,
    groupLabel: campaignColumn.groupLabel,
  };
};

/**
 * "EVA Comparison" report: metric rows (Time / Distance / Work / REX-only) down
 * the left, one column per EVA / REX / campaign set — the same column band,
 * grouping, expansion and diff grammar as EVA STM Coverage (shared components),
 * differing only in the left axis and cell body (a metric value / numeric Δ).
 */
const EvaComparisonPage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const revision = useMissionDocSelector(
    (m) => ({
      actions: m?.actions,
      stations: m?.stations,
      traverses: m?.traverses,
      evas: m?.evas,
      rexes: m?.rexes,
      reportCampaigns: m?.reportCampaigns,
      equipmentItems: m?.equipmentItems,
      landerLocation: m?.landerLocation,
      planetRadius: m?.planetRadius,
      defaultEvaDuration: m?.defaultEvaDuration,
    }),
    shallowEqual
  );
  const hiddenColumns = useAppSelector(
    (state) => state.report[REPORT_ID].hiddenColumns,
    shallowEqual
  );
  const differencesOnly = useAppSelector(
    (state) => state.report[REPORT_ID].differencesOnly,
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

  const sequenceByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: StmCoverageSequenceItem[] } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      if (!expandedColumnKeys.includes(column.key)) continue;
      // Campaign columns decompose into member EVAs; a single EVA/REX column
      // decomposes into its station/traverse sequence (as in EVA STM Coverage).
      result[column.key] = column.campaignUuid
        ? getCampaignMemberItems(mission, column)
        : getEvaSequenceItems(mission, column.evaUuid ?? "");
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
  }, [revision, visibleColumns, expandedColumnKeys]);

  const metricsByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: EvaComparisonColumnValues } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      result[column.key] = computeComparisonColumnValues({ mission, column });
      // per-sub-column values for an expanded column: member EVAs for a campaign
      // column, per-station/traverse contributions for a single EVA/REX column.
      for (const item of sequenceByColumnKey[column.key] ?? []) {
        if (column.campaignUuid) {
          const synthetic = memberColumn(mission, column, item.uuid);
          if (synthetic)
            result[synthetic.key] = computeComparisonColumnValues({ mission, column: synthetic });
        } else {
          result[`${column.key}_${item.uuid}`] = computeSequenceItemMetrics({
            mission,
            column,
            item,
          });
        }
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
  }, [revision, visibleColumns, sequenceByColumnKey]);

  // "Differences only": hide metric rows and columns whose value equals the
  // baseline everywhere (the baseline column always stays visible).
  const differences = useMemo(() => {
    if (!differencesOnly || !baselineKey) return null;
    const rowIds = new Set<string>();
    const columnKeys = new Set<string>();
    const baseline = metricsByColumnKey[baselineKey] ?? {};
    for (const column of visibleColumns) {
      if (column.key === baselineKey) continue;
      const values = metricsByColumnKey[column.key] ?? {};
      for (const row of EVA_COMPARISON_METRIC_ROWS) {
        if ((values[row.id] ?? null) !== (baseline[row.id] ?? null)) {
          rowIds.add(row.id);
          columnKeys.add(column.key);
        }
      }
    }
    return { rowIds, columnKeys };
  }, [differencesOnly, baselineKey, metricsByColumnKey, visibleColumns]);

  const displayedColumns = useMemo(
    () =>
      differences
        ? visibleColumns.filter(
            (column) => column.key === baselineKey || differences.columnKeys.has(column.key)
          )
        : visibleColumns,
    [differences, visibleColumns, baselineKey]
  );
  const visibleRowIds = differences ? [...differences.rowIds] : null;
  // fresh array each render; gate the effect on its serialization instead
  const visibleRowIdsKey = visibleRowIds?.join(",") ?? null;

  useEffect(() => {
    dispatch(
      reportSetColumnDerivedData({
        reportId: REPORT_ID,
        data: {
          visibleColumns: displayedColumns,
          metricsByColumnKey,
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
    metricsByColumnKey,
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
        showRexFilter={false}
        differencesOnlyToolTip="Only show metric rows and columns that differ from the baseline"
      />
      <div className={styles.coverageBody}>
        <div
          className={styles.gridScroll}
          style={
            {
              "--stmCoverageStationCellWidth": `${EVA_COMPARISON_STATION_CELL_WIDTH}px`,
              "--stmCoverageSummaryCellWidth": `${STM_COVERAGE_SUMMARY_CELL_WIDTH}px`,
              "--reportMetricLabelWidth": `${METRIC_LABEL_COLUMN_WIDTH}px`,
            } as CSSProperties
          }
          onMouseLeave={() => {
            dispatch(reportSetHoveredTopItem({ reportId: REPORT_ID, item: null }));
            dispatch(reportSetHoveredLeftItem({ reportId: REPORT_ID, item: null }));
          }}
        >
          <ReportColumnHeader
            leftAxis={<div className={comparisonStyles.metricLabelCorner}>Metric</div>}
          />
          <EvaComparisonTable />
        </div>
      </div>
    </ReportIdProvider>
  );
};

export default EvaComparisonPage;

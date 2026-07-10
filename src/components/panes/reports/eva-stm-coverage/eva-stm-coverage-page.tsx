import type { CSSProperties, FunctionComponent } from "react";
import { useEffect, useMemo } from "react";
import styles from "../shared/report-grid.module.css";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  reportSetColumnDerivedData,
  reportSetHoveredLeftItem,
  reportSetHoveredTopItem,
} from "store/report";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  computeColumnCoverage,
  getCoverageDifferences,
  getEvaSequenceItems,
} from "utils/stmEvaCoverage";
import { getCampaignMemberItems, getEvaColumns } from "utils/evaReportColumns";
import {
  STM_COVERAGE_STATION_CELL_WIDTH,
  STM_COVERAGE_SUMMARY_CELL_WIDTH,
} from "../../stm-rules/stm-rules-tier-titles";
import ReportControls from "../shared/report-controls";
import ReportColumnHeader, { CoverageHeaderLeftAxis } from "../shared/report-column-header";
import { ReportIdProvider } from "../reports-context";
import EvaStmCoverageTable from "./eva-stm-coverage-table";
import EvaStmCoverageDrilldown from "./eva-stm-coverage-drilldown";
import EvaStmCoverageHelp from "./eva-stm-coverage-help";

const REPORT_ID: ColumnReportId = "stmCoverage";

/**
 * "EVA STM Coverage" report: STM level3 items down the left, one column per EVA
 * (as-planned and REX) plus per-campaign planned/executed columns, each cell
 * rolling up how that column's actions satisfy the level3's rules. A baseline
 * column plus diff mode lets flight controllers compare EVA plans and see where
 * coverage differs. Shares the header/controls/cell grid with EVA Comparison.
 */
const EvaStmCoveragePage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  // The coverage computation only reads these collections. Gate the memos below
  // on their identity (shallowEqual) rather than the whole mission's, so an
  // unrelated doc mutation elsewhere doesn't force a full coverage recompute.
  const coverageRevision = useMissionDocSelector(
    (m) => ({
      actions: m?.actions,
      stations: m?.stations,
      traverses: m?.traverses,
      evas: m?.evas,
      rexes: m?.rexes,
      reportCampaigns: m?.reportCampaigns,
    }),
    shallowEqual
  );
  const level3s = useAppSelector((state) => state.stm.level3s, shallowEqual);
  const rules = useAppSelector((state) => state.stm.rules, deepEqual);
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
  const storedBaselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].baselineColumnKey,
    refEqual
  );
  const expandedColumnKeys = useAppSelector(
    (state) => state.report[REPORT_ID].expandedColumns,
    shallowEqual
  );
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);

  const allColumns = useMemo(
    () => (mission ? getEvaColumns(mission) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
    [coverageRevision]
  );
  const visibleColumns = useMemo(
    () => allColumns.filter((column) => !hiddenColumns.includes(column.key)),
    [allColumns, hiddenColumns]
  );

  // fall back to the first visible column when no baseline is stored or the
  // stored one was hidden/deleted
  const baselineKey =
    storedBaselineKey && visibleColumns.some((column) => column.key === storedBaselineKey)
      ? storedBaselineKey
      : (visibleColumns[0]?.key ?? null);

  const coverageByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: { [stmUuid: string]: StmCoverageLevel3 } } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      result[column.key] = computeColumnCoverage({
        mission,
        level3s,
        rules,
        column,
        rexStatusFilter,
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
  }, [coverageRevision, level3s, rules, visibleColumns, rexStatusFilter]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
  }, [coverageRevision, visibleColumns, expandedColumnKeys]);

  // "Differences only": hide rows and columns whose coverage is identical to
  // the baseline everywhere (the baseline column itself always stays visible)
  const coverageDifferences = useMemo(
    () =>
      differencesOnly && baselineKey && mission
        ? getCoverageDifferences({
            mission,
            coverageByColumnKey,
            columns: visibleColumns,
            baselineKey,
            level3s,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
    [differencesOnly, baselineKey, coverageRevision, coverageByColumnKey, visibleColumns, level3s]
  );
  const displayedColumns = useMemo(
    () =>
      coverageDifferences
        ? visibleColumns.filter(
            (column) => column.key === baselineKey || coverageDifferences.columnKeys.has(column.key)
          )
        : visibleColumns,
    [coverageDifferences, visibleColumns, baselineKey]
  );
  const visibleStmUuids = coverageDifferences?.stmUuids ?? null;

  // Mirror the derived data into the report slice so the grid components can
  // read it from Redux instead of a context / prop-drilling.
  useEffect(() => {
    dispatch(
      reportSetColumnDerivedData({
        reportId: REPORT_ID,
        data: {
          visibleColumns: displayedColumns,
          coverageByColumnKey,
          resolvedBaselineKey: baselineKey,
          sequenceByColumnKey,
          visibleRowIds: visibleStmUuids ? [...visibleStmUuids] : null,
        },
      })
    );
  }, [
    dispatch,
    displayedColumns,
    coverageByColumnKey,
    baselineKey,
    sequenceByColumnKey,
    visibleStmUuids,
  ]);

  if (!mission) return null;

  return (
    <ReportIdProvider value={REPORT_ID}>
      <ReportControls
        allColumns={allColumns}
        baselineKey={baselineKey}
        help={<EvaStmCoverageHelp />}
      />
      <div className={styles.coverageBody}>
        <div
          className={styles.gridScroll}
          style={
            {
              "--stmCoverageStationCellWidth": `${STM_COVERAGE_STATION_CELL_WIDTH}px`,
              "--stmCoverageSummaryCellWidth": `${STM_COVERAGE_SUMMARY_CELL_WIDTH}px`,
            } as CSSProperties
          }
          onMouseLeave={() => {
            dispatch(reportSetHoveredTopItem({ reportId: REPORT_ID, item: null }));
            dispatch(reportSetHoveredLeftItem({ reportId: REPORT_ID, item: null }));
          }}
        >
          <ReportColumnHeader leftAxis={<CoverageHeaderLeftAxis />} />
          <EvaStmCoverageTable />
        </div>
        {cellSelection && <EvaStmCoverageDrilldown />}
      </div>
    </ReportIdProvider>
  );
};

export default EvaStmCoveragePage;
